#!/usr/bin/env node
// Explicit catalog maintenance; never run during application/container startup.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const oracle = require('oracledb')
const { snapshot, assertPreserved, writePrivate } = require('./seed-data.cjs')
const defaultCatalog = path.join(
  __dirname,
  '../data/catalog-eu-2026-10-12.json',
)
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')

function imageType(bytes) {
  assert(
    Buffer.isBuffer(bytes) &&
      bytes.length >= 32 &&
      bytes.length <= 5 * 1024 * 1024,
    'Image must contain 32 bytes to 5 MiB',
  )
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return 'image/jpeg'
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png'
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp'
  throw new Error(
    'Unsupported image content; HTML, SVG and error pages are not product images',
  )
}

function validateCatalog(catalog) {
  assert.match(catalog.id || '', /^[a-z0-9][a-z0-9-]{0,119}$/)
  assert.equal(catalog.currency, 'EUR')
  assert(
    Array.isArray(catalog.products) && catalog.products.length > 0,
    'An empty catalog cannot be applied',
  )
  for (const field of ['legacyName', 'name'])
    assert.equal(
      new Set(catalog.products.map((p) => p[field])).size,
      catalog.products.length,
      `Duplicate ${field}`,
    )
  for (const p of catalog.products) {
    for (const [key, max] of [
      ['name', 255],
      ['legacyName', 255],
      ['category', 255],
      ['description', 500],
    ])
      assert(
        typeof p[key] === 'string' && p[key].trim() && p[key].length <= max,
        `Invalid ${key}`,
      )
    assert(
      Number.isFinite(p.price) &&
        p.price > 0 &&
        p.price < 1e8 &&
        Math.abs(p.price * 100 - Math.round(p.price * 100)) < 1e-6,
      'Invalid gross price',
    )
    assert.equal(p.source?.currency, 'EUR')
    assert.equal(p.source?.taxIncluded, true)
    assert.match(p.source?.checkedAt || '', /^\d{4}-\d{2}-\d{2}$/)
    assert(
      Number.isFinite(Date.parse(p.source.checkedAt)) &&
        p.source.checkedAt <= new Date().toISOString().slice(0, 10),
      'Invalid verification date',
    )
    assert(['IE', 'EU'].includes(p.source.market), 'Missing reference market')
    for (const url of [p.source.url, p.image?.url])
      assert.equal(
        new URL(url).protocol,
        'https:',
        'Source and image URLs must use HTTPS',
      )
    assert.match(
      p.image.sha256 || '',
      /^[a-f0-9]{64}$/,
      'Images must have a reviewed SHA-256 digest',
    )
  }
  return catalog
}

function assetPath(directory, product) {
  return path.join(directory, product.image.sha256)
}
function loadAsset(directory, product) {
  const bytes = fs.readFileSync(assetPath(directory, product))
  assert.equal(
    hash(bytes),
    product.image.sha256,
    `Image changed for ${product.name}; review a new catalog version`,
  )
  return { bytes, mime: imageType(bytes) }
}

async function downloadAssets(catalog, directory) {
  validateCatalog(catalog)
  fs.mkdirSync(directory, { recursive: true })
  for (const product of catalog.products) {
    const file = assetPath(directory, product)
    if (fs.existsSync(file)) {
      loadAsset(directory, product)
      continue
    }
    const response = await fetch(product.image.url, {
      signal: AbortSignal.timeout(30000),
    })
    assert(
      response.ok,
      `Image download failed (${response.status}) for ${product.name}`,
    )
    assert.equal(new URL(response.url).protocol, 'https:')
    assert(
      Number(response.headers.get('content-length') || 0) <= 5 * 1024 * 1024,
      'Image exceeds 5 MiB',
    )
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      assert(size <= 5 * 1024 * 1024, 'Image exceeds 5 MiB')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    imageType(bytes)
    assert.equal(
      hash(bytes),
      product.image.sha256,
      `Supplier image changed for ${product.name}; review a new catalog version`,
    )
    fs.writeFileSync(file, bytes, { flag: 'wx' })
  }
  return { images: catalog.products.length }
}

async function exists(connection, table) {
  return Boolean(
    (
      await connection.execute(
        'SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME=:name',
        { name: table },
      )
    ).rows[0][0],
  )
}

async function refreshCatalog(
  connection,
  catalog,
  { apply = false, expectedSchema, directory, assets } = {},
) {
  validateCatalog(catalog)
  const checksum = hash(JSON.stringify(catalog))
  const schema = (
    await connection.execute(
      "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM DUAL",
    )
  ).rows[0][0]
  if (apply)
    assert.equal(
      schema,
      expectedSchema,
      'The target schema must match --expect-schema',
    )
  const previousRun = async () => {
    if (!(await exists(connection, 'SHOPX_CATALOG_RUNS'))) return null
    const rows = (
      await connection.execute(
        'SELECT CHECKSUM FROM SHOPX_CATALOG_RUNS WHERE CATALOG_ID=:id',
        { id: catalog.id },
      )
    ).rows
    if (!rows.length) return null
    assert.equal(
      rows[0][0],
      checksum,
      'An applied catalog version was edited; create a new version',
    )
    return { catalog: catalog.id, schema, alreadyApplied: true }
  }
  const previous = await previousRun()
  if (previous) return previous
  // Validate every file before acquiring database locks or changing data.
  if (apply) {
    assert(
      directory && assets,
      'Private backup and asset directories are required',
    )
    for (const p of catalog.products) loadAsset(assets, p)
  }
  const resolve = async () => {
    const result = []
    for (const product of catalog.products) {
      const rows = (
        await connection.execute(
          'SELECT p.ID, c.NAME FROM PRODUCTS p LEFT JOIN CATEGORIES c ON c.ID=p.CATEGORY_ID WHERE p.NAME=:name',
          { name: product.legacyName },
        )
      ).rows
      assert.equal(
        rows.length,
        1,
        `Expected exactly one existing product named ${product.legacyName}`,
      )
      assert.equal(
        rows[0][1],
        product.category,
        `Category changed for ${product.legacyName}`,
      )
      const collisions = (
        await connection.execute(
          'SELECT ID FROM PRODUCTS WHERE NAME=:name AND ID<>:id',
          { name: product.name, id: rows[0][0] },
        )
      ).rows
      assert.equal(
        collisions.length,
        0,
        `A different product already uses ${product.name}`,
      )
      result.push({ product, id: rows[0][0] })
    }
    return result
  }
  if (!apply)
    return {
      catalog: catalog.id,
      schema,
      planOnly: true,
      products: (await resolve()).length,
    }
  // Oracle DDL commits implicitly: create only metadata tables, before the DML transaction.
  const ddl = {
    SHOPX_CATALOG_RUNS:
      'CREATE TABLE SHOPX_CATALOG_RUNS (CATALOG_ID VARCHAR2(120) PRIMARY KEY, CHECKSUM VARCHAR2(64) NOT NULL, APPLIED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)',
    SHOPX_CATALOG_SOURCES:
      'CREATE TABLE SHOPX_CATALOG_SOURCES (PRODUCT_ID NUMBER PRIMARY KEY REFERENCES PRODUCTS(ID) ON DELETE CASCADE, CATALOG_ID VARCHAR2(120) NOT NULL, SOURCE_JSON CLOB NOT NULL, MODEL_CHANGED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)',
  }
  for (const [table, sql] of Object.entries(ddl))
    if (!(await exists(connection, table))) {
      try {
        await connection.execute(sql)
      } catch (error) {
        if (error.errorNum !== 955) throw error
      }
    }
  try {
    // Do not silently overwrite edits made since the plan. Concurrent writers fail fast.
    await connection.execute(
      'LOCK TABLE PRODUCTS IN SHARE ROW EXCLUSIVE MODE NOWAIT',
    )
    const completed = await previousRun()
    if (completed) {
      await connection.rollback()
      return completed
    }
    const targets = await resolve()
    const before = await snapshot(connection)
    const backup = path.join(
      directory,
      `${catalog.id}-before-${Date.now()}.json`,
    )
    writePrivate(
      backup,
      { schema, catalog: catalog.id, checksum, products: before.PRODUCTS },
      true,
    )
    await connection.execute(
      'INSERT INTO SHOPX_CATALOG_RUNS (CATALOG_ID,CHECKSUM) VALUES (:id,:checksum)',
      { id: catalog.id, checksum },
    )
    for (const { id, product: p } of targets) {
      const asset = loadAsset(assets, p),
        extension = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        }[asset.mime]
      await connection.execute(
        'UPDATE PRODUCTS SET NAME=:name, DESCRIPTION=:description, PRICE=:price, IMAGE_FILENAME=:filename, IMAGE_MIME_TYPE=:mime, IMAGE_DATA=:data, IMAGE_UPDATED_AT=SYSTIMESTAMP WHERE ID=:id',
        {
          id,
          name: p.name,
          description: p.description,
          price: p.price,
          filename: `catalog-${id}.${extension}`,
          mime: asset.mime,
          data: { val: asset.bytes, type: oracle.BLOB },
        },
      )
      await connection.execute(
        "MERGE INTO SHOPX_CATALOG_SOURCES s USING (SELECT :id PRODUCT_ID FROM DUAL) p ON (s.PRODUCT_ID=p.PRODUCT_ID) WHEN MATCHED THEN UPDATE SET s.CATALOG_ID=:catalog, s.SOURCE_JSON=:source, s.MODEL_CHANGED_AT=CASE WHEN :modelChanged=1 THEN SYSTIMESTAMP ELSE s.MODEL_CHANGED_AT END WHEN NOT MATCHED THEN INSERT (PRODUCT_ID,CATALOG_ID,SOURCE_JSON,MODEL_CHANGED_AT) VALUES (:id,:catalog,:source,CASE WHEN :modelChanged=1 THEN SYSTIMESTAMP ELSE TIMESTAMP '1970-01-01 00:00:00' END)",
        {
          id,
          modelChanged: p.legacyName === p.name ? 0 : 1,
          catalog: catalog.id,
          source: {
            val: JSON.stringify({
              legacyName: p.legacyName,
              name: p.name,
              price: p.price,
              ...p.source,
              image: p.image,
            }),
            type: oracle.CLOB,
          },
        },
      )
    }
    const after = await snapshot(connection)
    const { PRODUCTS: beforeProducts, ...businessBefore } = before
    const { PRODUCTS: afterProducts, ...businessAfter } = after
    assertPreserved(businessBefore, businessAfter)
    assert.equal(
      afterProducts.length,
      beforeProducts.length,
      'The refresh must not add or remove products',
    )
    for (const { id, product } of targets) {
      const p = afterProducts.find((row) => row.ID === id)
      assert.equal(p.NAME, product.name)
      assert.equal(p.PRICE, product.price)
      assert.equal(hash(p.IMAGE_DATA), product.image.sha256)
      assert.equal(
        p.CATEGORY_ID,
        beforeProducts.find((row) => row.ID === id).CATEGORY_ID,
      )
    }
    await connection.commit()
    return {
      catalog: catalog.id,
      schema,
      products: targets.length,
      images: targets.length,
      businessDataPreserved: true,
      backup,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  }
}

async function main() {
  require('dotenv').config()
  const args = process.argv.slice(2),
    value = (name) => args[args.indexOf(name) + 1]
  const allowed = new Set([
    '--apply',
    '--download',
    '--expect-schema',
    '--catalog',
    '--output-dir',
    '--assets',
  ])
  for (let i = 0; i < args.length; i++) {
    assert(allowed.has(args[i]), 'Unknown catalog option')
    if (!['--apply', '--download'].includes(args[i]))
      assert(args[++i] && !args[i].startsWith('--'), 'Missing option value')
  }
  const option = (name, fallback) =>
    args.includes(name) ? value(name) : fallback
  const catalog = JSON.parse(
    fs.readFileSync(option('--catalog', defaultCatalog), 'utf8'),
  )
  const directory = path.resolve(option('--output-dir', '.local/catalog'))
  const assets = path.resolve(
    option('--assets', path.join(directory, 'assets')),
  )
  if (args.includes('--download'))
    console.log(await downloadAssets(catalog, assets))
  const connection = await oracle.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  })
  try {
    console.log(
      await refreshCatalog(connection, catalog, {
        apply: args.includes('--apply'),
        expectedSchema: option('--expect-schema'),
        directory,
        assets,
      }),
    )
  } finally {
    await connection.close()
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : error.code || 'Catalog refresh failed; connection details withheld.',
    )
    process.exitCode = 1
  })
module.exports = {
  validateCatalog,
  imageType,
  downloadAssets,
  refreshCatalog,
  defaultCatalog,
  loadAsset,
}

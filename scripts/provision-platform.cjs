#!/usr/bin/env node
// This installer only accepts factory-owned schemas. It never resets a schema.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const oracle = require('oracledb')
const bcrypt = require('bcrypt')
const { installDataset, validateDataset } = require('./seed-data.cjs')
const { loadAsset } = require('./refresh-catalog.cjs')

oracle.fetchAsString = [oracle.CLOB, oracle.NCLOB]
const root = path.resolve(__dirname, '..')
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const baseline = fs.readFileSync(
  path.join(root, 'migrations/001-commerce.sql'),
  'utf8',
)
const statements = baseline
  .replace(/^--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)
const pack = JSON.parse(
  fs.readFileSync(path.join(root, 'data/general-store-real-v1.json'), 'utf8'),
)

function validateSetup(setup) {
  assert(
    ['demo', 'empty'].includes(setup.seedMode || 'demo'),
    'Unsupported seed mode',
  )
  assert.match(setup.schema || '', /^SX_P_[A-F0-9]{12}$/)
  assert.equal(
    setup.configuration?.platformId,
    setup.schema.toLowerCase().replace('sx_p_', 'sx_'),
  )
  assert(
    ['bootstrap', 'configure'].includes(setup.action),
    'Unsupported installation action',
  )
  assert.match(setup.pdb || '', /^[A-Z][A-Z0-9_]{0,29}$/)
  assert.notEqual(setup.pdb, 'CDB$ROOT')
  // The runtime validator is compiled in the same image; no sibling imports.
  require('../dist/services/platformService').validatePlatformConfiguration(
    setup.configuration,
  )
  if (setup.action !== 'configure') {
    assert.match(setup.ownerEmail || '', /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    assert(
      setup.ownerEmail.length <= 255 &&
        typeof setup.ownerPassword === 'string' &&
        setup.ownerPassword.length >= 24,
    )
    assert.equal(setup.configuration.revision, 1)
  }
  return setup
}

async function exists(c, table) {
  return Boolean(
    (
      await c.execute(
        'SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME=:name',
        { name: table },
      )
    ).rows[0][0],
  )
}

async function verifyTable(c, statement) {
  const name = /^CREATE TABLE ([A-Z_]+)/.exec(statement)?.[1]
  assert(name, 'Unsupported baseline statement')
  const expected = [
    ...statement.matchAll(
      /^\s*([A-Z_]+)\s+(NUMBER|VARCHAR2|CLOB|BLOB|TIMESTAMP)\b/gm,
    ),
  ].map((m) => [m[1], m[2]])
  const columns = (
    await c.execute(
      'SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME=:name ORDER BY COLUMN_ID',
      { name },
    )
  ).rows
  assert.deepEqual(
    columns.map(([column, type]) => [column, type.replace(/\(\d+\)$/, '')]),
    expected,
    `Unexpected shape for ${name}`,
  )
  const named = [...statement.matchAll(/CONSTRAINT\s+([A-Z_]+)/g)].map(
    (m) => m[1],
  )
  const constraints = new Set(
    (
      await c.execute(
        "SELECT CONSTRAINT_NAME FROM USER_CONSTRAINTS WHERE TABLE_NAME=:name AND STATUS='ENABLED'",
        { name },
      )
    ).rows.map((r) => r[0]),
  )
  assert(
    named.every((key) => constraints.has(key)),
    `Missing constraints in ${name}`,
  )
}

async function bootstrapSchema(c, setup) {
  const identity = (
    await c.execute(
      "SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','CON_NAME') FROM DUAL",
    )
  ).rows[0]
  assert.deepEqual(
    identity,
    [setup.schema, setup.pdb],
    'Schema/PDB identity mismatch',
  )
  const tables = (
    await c.execute('SELECT TABLE_NAME FROM USER_TABLES')
  ).rows.map((r) => r[0])
  if (!tables.includes('SHOPX_PLATFORM_INSTALL')) {
    assert.equal(
      tables.length,
      0,
      'Refusing a non-empty schema without factory ownership',
    )
    await c.execute(
      'CREATE TABLE SHOPX_PLATFORM_INSTALL (ID NUMBER PRIMARY KEY, PLATFORM_ID VARCHAR2(32) NOT NULL, CHECKSUM VARCHAR2(64) NOT NULL, NEXT_STEP NUMBER NOT NULL, STATE VARCHAR2(20) NOT NULL)',
    )
  }
  const checksum = hash(baseline)
  let row = (
    await c.execute(
      'SELECT PLATFORM_ID, CHECKSUM, NEXT_STEP, STATE FROM SHOPX_PLATFORM_INSTALL WHERE ID=1',
    )
  ).rows[0]
  if (!row) {
    const others = (
      await c.execute(
        "SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME <> 'SHOPX_PLATFORM_INSTALL'",
      )
    ).rows[0][0]
    assert.equal(others, 0, 'Unclaimed non-empty schema')
    await c.execute(
      "INSERT INTO SHOPX_PLATFORM_INSTALL VALUES (1,:id,:checksum,0,'SCHEMA')",
      { id: setup.configuration.platformId, checksum },
      { autoCommit: true },
    )
    row = [setup.configuration.platformId, checksum, 0, 'SCHEMA']
  }
  assert.equal(
    row[0],
    setup.configuration.platformId,
    'Schema belongs to another platform',
  )
  assert.equal(
    row[1],
    checksum,
    'Baseline changed; use a versioned forward migration',
  )
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    const table = /^CREATE TABLE ([A-Z_]+)/.exec(statement)?.[1]
    assert(table, 'Only CREATE TABLE is allowed in the baseline')
    if (i > row[2]) throw new Error('Missing schema checkpoint')
    if (!(await exists(c, table))) {
      assert.equal(i, row[2], 'Previously completed schema step is missing')
      await c.execute(statement)
    }
    // Covers a crash after CREATE TABLE but before checkpoint commit.
    await verifyTable(c, statement)
    if (i === row[2]) {
      await c.execute(
        'UPDATE SHOPX_PLATFORM_INSTALL SET NEXT_STEP=:step WHERE ID=1',
        { step: i + 1 },
        { autoCommit: true },
      )
      row[2] = i + 1
    }
  }
  if (!(await exists(c, 'SHOPX_PLATFORM_CONFIG'))) {
    await c.execute(
      'CREATE TABLE SHOPX_PLATFORM_CONFIG (ID NUMBER PRIMARY KEY, CONFIGURATION CLOB NOT NULL, REVISION NUMBER NOT NULL, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)',
    )
  }
  return row[3] === 'READY'
}

async function provision(c, setup, assets, outputDirectory) {
  validateSetup(setup)
  const seedMode = setup.seedMode || 'demo'
  const selectedPack = seedMode === 'demo' ? pack : null
  if (selectedPack) validateDataset(selectedPack)
  // Validate all immutable assets before any table/data work.
  const images =
    setup.action === 'configure' || !selectedPack
      ? []
      : selectedPack.products.map((product) => loadAsset(assets, product))
  const complete = await bootstrapSchema(c, setup)
  const previous = (
    await c.execute(
      'SELECT CONFIGURATION, REVISION FROM SHOPX_PLATFORM_CONFIG WHERE ID=1',
    )
  ).rows[0]
  if (setup.action === 'configure') {
    assert(complete && previous, 'Platform is not provisioned')
    if (previous[1] === setup.configuration.revision) {
      assert.equal(
        previous[0],
        JSON.stringify(setup.configuration),
        'Revision already has different content',
      )
      return { alreadyApplied: true }
    }
    assert.equal(
      previous[1] + 1,
      setup.configuration.revision,
      'Configuration revision conflict',
    )
    const result = await c.execute(
      'UPDATE SHOPX_PLATFORM_CONFIG SET CONFIGURATION=:value, REVISION=:revision, UPDATED_AT=SYSTIMESTAMP WHERE ID=1 AND REVISION=:expected',
      {
        value: JSON.stringify(setup.configuration),
        revision: setup.configuration.revision,
        expected: previous[1],
      },
      { autoCommit: false },
    )
    assert.equal(result.rowsAffected, 1, 'Concurrent configuration update')
    await c.commit()
    return { configured: true }
  }
  if (complete) {
    assert(
      previous &&
        JSON.parse(previous[0]).platformId === setup.configuration.platformId,
      'Missing platform identity',
    )
    const storedMode = (await exists(c, 'SHOPX_PLATFORM_CONTENT'))
      ? (
          await c.execute(
            'SELECT SEED_MODE FROM SHOPX_PLATFORM_CONTENT WHERE ID=1',
          )
        ).rows[0]?.[0]
      : 'demo'
    assert.equal(
      storedMode,
      seedMode,
      'Initial content mode cannot change after installation',
    )
    return { alreadyApplied: true }
  }
  // Separate from the stable schema baseline, preserving existing checkpoints.
  // Store the selected mode before the catalog installer can commit any data.
  if (!(await exists(c, 'SHOPX_PLATFORM_CONTENT'))) {
    await c.execute(
      "CREATE TABLE SHOPX_PLATFORM_CONTENT (ID NUMBER PRIMARY KEY, SEED_MODE VARCHAR2(10) NOT NULL CHECK (SEED_MODE IN ('demo','empty')))",
    )
  }
  const recorded = (
    await c.execute('SELECT SEED_MODE FROM SHOPX_PLATFORM_CONTENT WHERE ID=1')
  ).rows[0]
  if (recorded)
    assert.equal(
      recorded[0],
      seedMode,
      'Initial content mode changed during installation',
    )
  else
    await c.execute(
      'INSERT INTO SHOPX_PLATFORM_CONTENT VALUES (1,:seedMode)',
      { seedMode },
      { autoCommit: true },
    )
  const installed = selectedPack
    ? await installDataset(c, selectedPack, {
        apply: true,
        expectedSchema: setup.schema,
        directory: outputDirectory,
      })
    : {}
  try {
    for (const [i, product] of (selectedPack?.products || []).entries()) {
      await c.execute(
        'UPDATE PRODUCTS SET IMAGE_FILENAME=:filename, IMAGE_MIME_TYPE=:mime, IMAGE_DATA=:data, IMAGE_UPDATED_AT=SYSTIMESTAMP WHERE NAME=:name AND IMAGE_DATA IS NULL',
        {
          name: product.name,
          filename:
            product.key + (images[i].mime === 'image/png' ? '.png' : '.jpg'),
          mime: images[i].mime,
          data: images[i].bytes,
        },
      )
    }
    const count = (await c.execute('SELECT COUNT(*) FROM USERS')).rows[0][0]
    assert.equal(count, 0, 'Unexpected accounts before owner creation')
    await c.execute(
      "INSERT INTO USERS (EMAIL,PASSWORD,NAME,ROLE) VALUES (:email,:password,:name,'SUPPORT')",
      {
        email: setup.ownerEmail,
        password: await bcrypt.hash(setup.ownerPassword, 12),
        name: setup.configuration.displayName + ' administrator',
      },
    )
    await c.execute(
      'INSERT INTO SHOPX_PLATFORM_CONFIG (ID,CONFIGURATION,REVISION) VALUES (1,:value,1)',
      { value: JSON.stringify(setup.configuration) },
    )
    await c.execute(
      "UPDATE SHOPX_PLATFORM_INSTALL SET STATE='READY' WHERE ID=1",
    )
    await c.commit()
  } catch (error) {
    await c.rollback()
    throw error
  }
  return {
    provisioned: true,
    products: selectedPack?.products.length || 0,
    seedMode,
    datasetAlreadyApplied: Boolean(installed.alreadyApplied),
  }
}

async function main() {
  const setup = validateSetup(
    JSON.parse(fs.readFileSync(process.env.PLATFORM_SETUP_FILE, 'utf8')),
  )
  const connection = await oracle.getConnection({
    user: setup.schema,
    password: setup.databasePassword,
    connectString: process.env.DB_CONNECT_STRING,
  })
  try {
    console.log(
      JSON.stringify(
        await provision(
          connection,
          setup,
          process.env.PLATFORM_ASSETS_DIR,
          process.env.PLATFORM_OUTPUT_DIR || '/tmp/shopx-install',
        ),
      ),
    )
  } finally {
    await connection.close()
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      'Platform installation failed. Check schema identity, baseline checkpoints, configuration and verified assets.',
    )
    process.exitCode = 1
  })
module.exports = { validateSetup, bootstrapSchema, provision, verifyTable }

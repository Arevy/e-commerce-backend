#!/usr/bin/env node
// Explicit, additive data installation. Never called by server/container startup.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const oracle = require('oracledb');
const bcrypt = require('bcrypt');

oracle.fetchAsString = [oracle.CLOB, oracle.NCLOB];
oracle.fetchAsBuffer = [oracle.BLOB];
const tables = ['CATEGORIES', 'PRODUCTS', 'USERS', 'ADDRESSES', 'ORDERS', 'ORDER_ITEMS', 'PAYMENTS', 'CART_ITEMS', 'WISHLIST', 'CMS_PAGES', 'REVIEWS'];
const ledger = 'SHOPX_DATASET_RUNS';
const defaultDataset = path.join(__dirname, '../data/general-store-v1.json');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function validateDataset(data) {
  assert.match(data.id || '', /^[a-z][a-z0-9-]{0,119}$/);
  const collections = ['categories', 'products', 'accounts', 'addresses', 'orders', 'reviews', 'cms', 'cart', 'wishlist'];
  for (const name of collections) assert(Array.isArray(data[name]), `Missing collection: ${name}`);
  const keys = {};
  for (const name of collections.filter(name => !['cart', 'wishlist'].includes(name))) {
    keys[name] = new Set();
    for (const item of data[name]) {
      assert.match(item.key || '', /^[a-z][a-z0-9-]*$/);
      assert(!keys[name].has(item.key), `Duplicate key in ${name}`);
      keys[name].add(item.key);
    }
  }
  const text = (value, max) => assert(typeof value === 'string' && value.trim() && value.length <= max, 'Invalid or oversized text');
  const unique = (rows, field) => assert.equal(new Set(rows.map(row => row[field]?.toLowerCase())).size, rows.length, `Duplicate ${field}`);
  for (const name of ['categories', 'products']) { unique(data[name], 'name'); for (const row of data[name]) { text(row.name, 255); text(row.description, 500); } }
  unique(data.accounts, 'email'); unique(data.cms, 'slug');
  for (const item of data.products) {
    assert(keys.categories.has(item.category), 'Unknown product category');
    assert(Number.isFinite(item.price) && item.price >= 0 && item.price < 1e8 && Math.abs(item.price * 100 - Math.round(item.price * 100)) < 1e-6, 'Invalid product price');
  }
  for (const item of data.accounts) {
    assert(['SUPPORT', 'CUSTOMER'].includes(item.role), 'Unknown account role');
    text(item.email, 255); text(item.name, 255);
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email), 'Invalid email');
    assert(!('password' in item), 'Passwords belong in private credentials, never the dataset');
  }
  for (const item of [...data.addresses, ...data.cart, ...data.wishlist, ...data.orders, ...data.reviews]) {
    assert(keys.accounts.has(item.account), 'Unknown account reference');
    assert.equal(data.accounts.find(account => account.key === item.account).role, 'CUSTOMER', 'Commerce examples must belong to a customer');
  }
  for (const item of data.addresses) { text(item.street, 255); text(item.city, 255); text(item.postalCode, 20); text(item.country, 100); }
  for (const item of data.orders) { assert(Array.isArray(item.lines) && item.lines.length, 'Empty order'); assert(Number.isInteger(item.daysAgo) && item.daysAgo >= 0 && item.daysAgo < 3650, 'Invalid order date'); unique(item.lines, 'product'); }
  for (const item of [...data.cart, ...data.wishlist, ...data.reviews, ...data.orders.flatMap(order => order.lines)]) assert(keys.products.has(item.product), 'Unknown product reference');
  for (const name of ['cart', 'wishlist']) assert.equal(new Set(data[name].map(item => `${item.account}:${item.product}`)).size, data[name].length, `Duplicate ${name} item`);
  for (const item of [...data.cart, ...data.orders.flatMap(order => order.lines)]) assert(Number.isSafeInteger(item.quantity) && item.quantity > 0, 'Invalid quantity');
  for (const item of data.reviews) { assert(Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5, 'Invalid rating'); text(item.text, 1000); }
  for (const item of data.cms) { text(item.slug, 150); assert.match(item.slug, /^[a-z0-9-]+$/); text(item.title, 255); text(item.excerpt, 500); text(item.body, 100000); assert(['PUBLISHED', 'DRAFT', 'ARCHIVED'].includes(item.status), 'Invalid CMS status'); }
  return data;
}

async function tableExists(connection, name) {
  return Boolean((await connection.execute('SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME=:name', {name})).rows[0][0]);
}

async function snapshot(connection) {
  const result = {};
  for (const name of [...tables, 'ORDER_PRODUCTS']) {
    if (await tableExists(connection, name)) result[name] = (await connection.execute(`SELECT * FROM ${name}`, {}, {outFormat: oracle.OUT_FORMAT_OBJECT})).rows;
  }
  return result;
}

function assertPreserved(before, after) {
  for (const [table, rows] of Object.entries(before)) {
    const hashes = new Map();
    for (const row of after[table] || []) hashes.set(digest(row), (hashes.get(digest(row)) || 0) + 1);
    for (const row of rows) {
      const hash = digest(row);
      assert(hashes.get(hash) > 0, `Existing row changed or disappeared in ${table}`);
      hashes.set(hash, hashes.get(hash) - 1);
    }
  }
}

function writePrivate(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {mode: 0o600, flag: exclusive ? 'wx' : 'w'});
  fs.chmodSync(file, 0o600);
}

async function getRun(connection, data) {
  if (!(await tableExists(connection, ledger))) return null;
  const rows = (await connection.execute(`SELECT CHECKSUM, RECORDS FROM ${ledger} WHERE DATASET_ID=:id`, {id: data.id})).rows;
  if (!rows.length) return null;
  assert.equal(rows[0][0], digest(data), 'This dataset version was already applied with different content. Create a new version instead.');
  return JSON.parse(rows[0][1]);
}

async function installDataset(connection, data, {apply = false, expectedSchema, directory} = {}) {
  validateDataset(data);
  const schema = (await connection.execute("SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM DUAL")).rows[0][0];
  if (apply) assert.equal(schema, expectedSchema, 'Use --expect-schema with the exact target schema before applying data');
  for (const table of tables) assert(await tableExists(connection, table), `Initialize the schema first; missing ${table}`);
  const existing = await getRun(connection, data);
  if (existing) return {...existing, alreadyApplied: true, planOnly: !apply,
    currentCounts: Object.fromEntries(Object.entries(await snapshot(connection)).map(([name, rows]) => [name, rows.length]))};
  const before = await snapshot(connection);
  const beforeCounts = Object.fromEntries(Object.entries(before).map(([name, rows]) => [name, rows.length]));
  if (!apply) return {dataset: data.id, schema, planOnly: true, beforeCounts, planned: Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([key, rows]) => [key, rows.length]))};
  assert(directory, 'A private output directory is required');
  writePrivate(path.join(directory, `before-${Date.now()}.json`), {schema, capturedAt: new Date().toISOString(), tables: before}, true);
  const accessFile = path.join(directory, `${data.id}-accounts.json`);
  let access;
  // The only DDL creates an installation ledger. Oracle commits DDL implicitly;
  // it runs before the application-data transaction and never alters existing tables.
  if (!(await tableExists(connection, ledger))) {
    try { await connection.execute(`CREATE TABLE ${ledger} (DATASET_ID VARCHAR2(120) PRIMARY KEY, CHECKSUM VARCHAR2(64) NOT NULL, RECORDS CLOB NOT NULL, APPLIED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`); }
    catch (error) { if (error.errorNum !== 955) throw error; }
  }
  const ids = {categories: {}, products: {}, accounts: {}, addresses: {}, orders: {}, payments: {}, reviews: {}, cms: {}};
  const insert = async (table, values) => {
    const columns = Object.keys(values);
    const binds = Object.fromEntries(columns.map((column, index) => [`v${index}`, values[column]]));
    binds.resultId = {dir: oracle.BIND_OUT, type: oracle.NUMBER};
    const result = await connection.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, index) => `:v${index}`).join(',')}) RETURNING ID INTO :resultId`, binds, {autoCommit: false});
    return result.outBinds.resultId[0];
  };
  const rejectCollision = async (table, column, value) => {
    assert.equal((await connection.execute(`SELECT COUNT(*) FROM ${table} WHERE LOWER(${column})=LOWER(:value)`, {value})).rows[0][0], 0, `A ${table} natural key already exists; existing records will not be overwritten`);
  };
  try {
    // The unique claim serializes concurrent installs of the same version.
    try { await connection.execute(`INSERT INTO ${ledger} (DATASET_ID,CHECKSUM,RECORDS) VALUES (:id,:checksum,'{}')`, {id: data.id, checksum: digest(data)}, {autoCommit: false}); }
    catch (error) {
      if (error.errorNum !== 1) throw error;
      await connection.rollback();
      return {...await getRun(connection, data), alreadyApplied: true};
    }
    if (fs.existsSync(accessFile)) access = JSON.parse(fs.readFileSync(accessFile, 'utf8'));
    else {
      access = Object.fromEntries(data.accounts.map(account => [account.key, {...account, password: crypto.randomBytes(24).toString('base64url')}]));
      writePrivate(accessFile, access, true);
    }
    for (const account of data.accounts) assert(access[account.key]?.email === account.email && access[account.key]?.role === account.role && access[account.key]?.password?.length >= 20, 'Private account configuration does not match this dataset');
    for (const row of data.categories) {
      const matches = (await connection.execute('SELECT ID FROM CATEGORIES WHERE LOWER(NAME)=LOWER(:name)', {name: row.name})).rows;
      assert(matches.length <= 1, 'Ambiguous category name');
      ids.categories[row.key] = matches[0]?.[0] ?? await insert('CATEGORIES', {NAME: row.name, DESCRIPTION: row.description});
    }
    for (const row of data.products) {
      await rejectCollision('PRODUCTS', 'NAME', row.name);
      ids.products[row.key] = await insert('PRODUCTS', {NAME: row.name, PRICE: row.price, DESCRIPTION: row.description, CATEGORY_ID: ids.categories[row.category]});
    }
    for (const row of data.accounts) {
      await rejectCollision('USERS', 'EMAIL', row.email);
      ids.accounts[row.key] = await insert('USERS', {EMAIL: row.email, NAME: row.name, ROLE: row.role, PASSWORD: await bcrypt.hash(access[row.key].password, 12)});
    }
    for (const row of data.addresses) ids.addresses[row.key] = await insert('ADDRESSES', {USER_ID: ids.accounts[row.account], STREET: row.street, CITY: row.city, POSTAL_CODE: row.postalCode, COUNTRY: row.country});
    for (const row of data.cart) await connection.execute('INSERT INTO CART_ITEMS (USER_ID,PRODUCT_ID,QUANTITY) VALUES (:u,:p,:q)', {u: ids.accounts[row.account], p: ids.products[row.product], q: row.quantity}, {autoCommit: false});
    for (const row of data.wishlist) await connection.execute('INSERT INTO WISHLIST (USER_ID,PRODUCT_ID) VALUES (:u,:p)', {u: ids.accounts[row.account], p: ids.products[row.product]}, {autoCommit: false});
    for (const row of data.orders) {
      const lines = row.lines.map(line => ({...line, price: data.products.find(product => product.key === line.product).price}));
      const total = lines.reduce((sum, line) => sum + Math.round(line.price * 100) * line.quantity, 0) / 100;
      const created = new Date(Date.now() - row.daysAgo * 86400000);
      const order = ids.orders[row.key] = await insert('ORDERS', {USER_ID: ids.accounts[row.account], TOTAL: total, STATUS: 'PENDING', CREATED_AT: created, UPDATED_AT: created});
      for (const line of lines) await connection.execute('INSERT INTO ORDER_ITEMS (ORDER_ID,PRODUCT_ID,QUANTITY,PRICE) VALUES (:o,:p,:q,:price)', {o: order, p: ids.products[line.product], q: line.quantity, price: line.price}, {autoCommit: false});
      ids.payments[row.key] = await insert('PAYMENTS', {ORDER_ID: order, AMOUNT: total, METHOD: 'CASH', STATUS: 'PENDING', CREATED_AT: created});
    }
    for (const row of data.reviews) ids.reviews[row.key] = await insert('REVIEWS', {USER_ID: ids.accounts[row.account], PRODUCT_ID: ids.products[row.product], RATING: row.rating, REVIEW_TEXT: row.text});
    for (const row of data.cms) {
      await rejectCollision('CMS_PAGES', 'SLUG', row.slug);
      ids.cms[row.key] = await insert('CMS_PAGES', {SLUG: row.slug, TITLE: row.title, EXCERPT: row.excerpt, BODY: {val: row.body, type: oracle.CLOB}, STATUS: row.status, PUBLISHED_AT: row.status === 'PUBLISHED' ? new Date() : null});
    }
    const after = await snapshot(connection);
    assertPreserved(before, after);
    const result = {dataset: data.id, schema, ids, beforeCounts, afterCounts: Object.fromEntries(Object.entries(after).map(([name, rows]) => [name, rows.length]))};
    await connection.execute(`UPDATE ${ledger} SET RECORDS=:records WHERE DATASET_ID=:id`, {records: {val: JSON.stringify(result), type: oracle.CLOB}, id: data.id}, {autoCommit: false});
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
}

async function main() {
  require('dotenv').config();
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
  const allowed = new Set(['--apply', '--expect-schema', '--dataset', '--output-dir']);
  for (let index = 0; index < args.length; index++) {
    assert(allowed.has(args[index]), 'Usage: npm run data:seed -- [--apply --expect-schema SCHEMA] [--dataset FILE] [--output-dir PRIVATE_DIRECTORY]');
    if (args[index] !== '--apply') assert(args[++index] && !args[index].startsWith('--'), 'Missing option value');
  }
  const data = JSON.parse(fs.readFileSync(value('--dataset') || defaultDataset, 'utf8'));
  const connection = await oracle.getConnection({user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING});
  try {
    const result = await installDataset(connection, data, {apply: args.includes('--apply'), expectedSchema: value('--expect-schema'), directory: path.resolve(value('--output-dir') || '.local/data')});
    console.log(JSON.stringify({dataset: result.dataset, schema: result.schema, planOnly: result.planOnly || false, alreadyApplied: result.alreadyApplied || false, counts: result.currentCounts || result.afterCounts || result.beforeCounts, planned: result.planned}, null, 2));
    if (!result.planOnly) console.log(result.alreadyApplied ? 'No rows or passwords changed. Credentials are only available in the original private account file; they are not regenerated.' : 'Passwords and pre-install snapshots are kept in the private output directory; existing passwords were not changed.');
  } finally { await connection.close(); }
}
if (require.main === module) main().catch(error => { console.error(error.code || (error instanceof assert.AssertionError ? error.message : 'Data installation failed; no connection details were printed.')); process.exitCode = 1; });
module.exports = {validateDataset, snapshot, assertPreserved, installDataset, writePrivate, defaultDataset};

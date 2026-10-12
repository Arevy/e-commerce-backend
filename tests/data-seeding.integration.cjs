const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const oracle = require('oracledb');
const bcrypt = require('bcrypt');
const {installDataset, snapshot, assertPreserved, defaultDataset} = require('../scripts/seed-data.cjs');

// Only creates/drops its own randomized schema in ORCLPDB1. It never reads the
// application's .env/credentials and never resets or modifies the AREVY schema.
test('additive dataset installation in an isolated Oracle schema', {timeout: 180000}, async t => {
  const container = process.env.SHOPX_DATA_TEST_CONTAINER;
  assert.match(container || '', /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Set SHOPX_DATA_TEST_CONTAINER to an Oracle container with ORCLPDB1 open');
  const schema = `SX_DATA_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const password = `Sx${crypto.randomBytes(14).toString('hex')}`;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'shopx-data-test-'));
  const sql = (statement, admin = true) => new Promise((resolve, reject) => {
    const child = execFile('docker', ['exec', '-i', container, 'bash', '-lc', 'sqlplus -s -L /nolog'], {timeout: 30000, maxBuffer: 1024 * 1024}, (error, stdout, stderr) => {
      const codes = [...new Set((stdout + stderr).match(/(?:ORA|PLS|SP2)-\d+/g) || [])];
      if (error || codes.length) reject(new Error(`Isolated SQL test failed: ${codes.join(', ') || 'Docker/SQLPlus error'}`));
      else resolve();
    });
    child.stdin.on('error', () => {});
    child.stdin.end('SET ECHO OFF FEEDBACK OFF VERIFY OFF HEADING OFF PAGESIZE 0\nWHENEVER OSERROR EXIT FAILURE ROLLBACK\nWHENEVER SQLERROR EXIT FAILURE ROLLBACK\n'
      + (admin ? 'CONNECT / AS SYSDBA\nALTER SESSION SET CONTAINER=ORCLPDB1;\n' : `CONNECT ${schema}/"${password}"@localhost:1521/ORCLPDB1\n`)
      + statement + '\nEXIT\n');
  });
  let connection;
  await sql(`CREATE USER ${schema} IDENTIFIED BY "${password}";`);
  try {
    await sql(`GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE TO ${schema};\nALTER USER ${schema} QUOTA 32M ON USERS;`);
    const source = fs.readFileSync(path.join(__dirname, '../sql_script.txt'), 'utf8');
    await sql(source, false);
    connection = await oracle.getConnection({user: schema, password, connectString: process.env.SHOPX_DATA_TEST_CONNECT_STRING || '127.0.0.1:1521/ORCLPDB1'});
    const data = JSON.parse(fs.readFileSync(defaultDataset, 'utf8'));
    const original = await snapshot(connection);
    const options = {apply: true, expectedSchema: schema, directory: output};
    let installed;
    await t.test('default plan is read-only and schema guard prevents accidental writes', async () => {
      assert((await installDataset(connection, data)).planOnly);
      assert.equal((await connection.execute("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='SHOPX_DATASET_RUNS'")).rows[0][0], 0);
      await assert.rejects(installDataset(connection, data, {...options, expectedSchema: 'NOT_THIS_SCHEMA'}));
    });
    await t.test('applies real Oracle rows while preserving every original record', async () => {
      installed = await installDataset(connection, data, options);
      assertPreserved(original, await snapshot(connection));
      for (const [table, extra] of Object.entries({CATEGORIES: 3, PRODUCTS: 12, USERS: 4, ADDRESSES: 2, ORDERS: 2, ORDER_ITEMS: 4, PAYMENTS: 2, CART_ITEMS: 3, WISHLIST: 4, CMS_PAGES: 4, REVIEWS: 3})) assert.equal(installed.afterCounts[table] - installed.beforeCounts[table], extra);
      const credentials = JSON.parse(fs.readFileSync(path.join(output, `${data.id}-accounts.json`), 'utf8'));
      for (const account of data.accounts) {
        const [[hash, role]] = (await connection.execute('SELECT PASSWORD, ROLE FROM USERS WHERE ID=:id', {id: installed.ids.accounts[account.key]})).rows;
        assert(await bcrypt.compare(credentials[account.key].password, hash)); assert.equal(role, account.role);
      }
      for (const orderId of Object.values(installed.ids.orders)) {
        const [[total, lineTotal, paymentAmount, status]] = (await connection.execute("SELECT o.TOTAL,(SELECT SUM(i.PRICE*i.QUANTITY) FROM ORDER_ITEMS i WHERE i.ORDER_ID=o.ID),p.AMOUNT,p.STATUS FROM ORDERS o JOIN PAYMENTS p ON p.ORDER_ID=o.ID WHERE o.ID=:id", {id: orderId})).rows;
        assert.equal(total, lineTotal); assert.equal(total, paymentAmount); assert.equal(status, 'PENDING');
      }
    });
    await t.test('rerun is a no-op and does not reset changed customer data or passwords', async () => {
      await connection.execute('UPDATE USERS SET NAME=:name WHERE ID=:id', {name: 'Edited by the user', id: installed.ids.accounts.customer}, {autoCommit: true});
      const before = await snapshot(connection);
      assert((await installDataset(connection, data, options)).alreadyApplied);
      assert((await installDataset(connection, data)).planOnly, 'A repeated plan must remain read-only');
      const after = await snapshot(connection); assertPreserved(before, after); assertPreserved(after, before);
      const changed = structuredClone(data); changed.products[0].price += 1;
      await assert.rejects(installDataset(connection, changed, options), /different content/);
    });
    await t.test('late Oracle failure rolls back products, accounts, orders and ledger claim', async () => {
      await connection.execute("ALTER TABLE CMS_PAGES ADD CONSTRAINT CK_TEST_CMS_FAILURE CHECK (SLUG NOT LIKE 'rollback-%')");
      const failed = structuredClone(data); failed.id = 'general-store-rollback-test';
      for (const item of failed.products) item.name += ' Rollback Test';
      for (const item of failed.accounts) item.email = 'rollback-' + item.email;
      for (const item of failed.cms) item.slug = 'rollback-' + item.slug;
      const before = await snapshot(connection);
      await assert.rejects(installDataset(connection, failed, options), error => error.errorNum === 2290);
      const after = await snapshot(connection); assertPreserved(before, after); assertPreserved(after, before);
      assert.equal((await connection.execute('SELECT COUNT(*) FROM SHOPX_DATASET_RUNS WHERE DATASET_ID=:id', {id: failed.id})).rows[0][0], 0);
    });
    await t.test('concurrent installation applies once and only the winner writes credentials', async () => {
      const concurrent = structuredClone(data); concurrent.id = 'general-store-concurrency-test';
      for (const item of concurrent.products) item.name += ' Concurrent Test';
      for (const item of concurrent.accounts) item.email = 'concurrent-' + item.email;
      for (const item of concurrent.cms) item.slug = 'concurrent-' + item.slug;
      const other = await oracle.getConnection({user: schema, password, connectString: process.env.SHOPX_DATA_TEST_CONNECT_STRING || '127.0.0.1:1521/ORCLPDB1'});
      try {
        const results = await Promise.all([connection, other].map((conn, index) => installDataset(conn, concurrent, {...options, directory: path.join(output, `parallel-${index}`)})));
        assert.equal(results.filter(result => result.alreadyApplied).length, 1);
        assert.deepEqual(results[0].ids, results[1].ids);
        const accountFiles = [0, 1].filter(index => fs.existsSync(path.join(output, `parallel-${index}`, `${concurrent.id}-accounts.json`)));
        assert.equal(accountFiles.length, 1);
      } finally { await other.close(); }
    });
  } finally {
    if (connection) await connection.close();
    await sql(`DROP USER ${schema} CASCADE;`);
    fs.rmSync(output, {recursive: true, force: true});
  }
});

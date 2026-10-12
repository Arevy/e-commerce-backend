const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {randomBytes} = require('node:crypto')
const {execFile} = require('node:child_process')
const {promisify} = require('node:util')

const exec = promisify(execFile)
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'sql_script.txt'), 'utf8')
const expected = {
  CATEGORIES: 11, PRODUCTS: 33, USERS: 16, ADDRESSES: 17, ORDERS: 23,
  ORDER_ITEMS: 41, PAYMENTS: 23, CART_ITEMS: 15, WISHLIST: 15, CMS_PAGES: 8, REVIEWS: 10,
}

// Opt-in: never read application credentials or reset an application schema.
// The Oracle image must support OS authentication and have an open ORCLPDB1.
test('Oracle demo reset in an isolated, temporary schema', {timeout: 180_000}, async t => {
  const container = process.env.SHOPX_SQL_TEST_CONTAINER
  assert.match(container || '', /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
    'Set SHOPX_SQL_TEST_CONTAINER to a disposable Oracle 19c container with ORCLPDB1')
  assert(!/^\s*(?:CONNECT|HOST|ALTER\s+SESSION|CREATE\s+USER)\b/im.test(source),
    'The reset must not switch connections or create users')
  const schema = `SX_TEST_${randomBytes(6).toString('hex').toUpperCase()}`
  const password = `Sx${randomBytes(14).toString('hex')}`

  async function sql(statement, {admin = false, scriptControlsErrors = false} = {}) {
    const login = admin
      ? 'CONNECT / AS SYSDBA\nALTER SESSION SET CONTAINER=ORCLPDB1;\n'
      : `CONNECT ${schema}/"${password}"@localhost:1521/ORCLPDB1\n`
    const input = 'SET ECHO OFF FEEDBACK OFF VERIFY OFF HEADING OFF PAGESIZE 0 LINESIZE 250\n'
      + 'WHENEVER OSERROR EXIT FAILURE ROLLBACK\nWHENEVER SQLERROR EXIT FAILURE ROLLBACK\n'
      + login
      // Verify the script's own directives, not protection supplied by this runner.
      + (scriptControlsErrors ? 'WHENEVER SQLERROR CONTINUE NONE\nWHENEVER OSERROR CONTINUE NONE\n' : '')
      + statement + '\nEXIT\n'
    const child = exec('docker', ['exec', '-i', container, 'bash', '-lc', 'sqlplus -s -L /nolog'],
      {timeout: 30_000, maxBuffer: 1024 * 1024})
    // execFile has no input option; write to its stdin explicitly.
    child.child.stdin.on('error', () => {}) // EPIPE is reported by the process result.
    child.child.stdin.end(input)
    let status = 0
    let output
    try {
      const result = await child
      output = result.stdout + result.stderr
    } catch (error) {
      status = typeof error.code === 'number' ? error.code : -1
      output = (error.stdout || '') + (error.stderr || '')
    }
    const codes = [...new Set(output.match(/(?:ORA|SP2|PLS)-\d+/g) || [])]
    if (!scriptControlsErrors) {
      // Never print raw SQL output: login errors may contain private information.
      assert.equal(status, 0, `SQL process failed: ${codes.join(', ') || 'check Docker/SQL*Plus availability'}`)
      assert.deepEqual(codes, [], 'Unexpected Oracle/SQL*Plus error codes')
    }
    return {status, output, codes}
  }

  async function scalar(statement) {
    const {output} = await sql(statement)
    assert.match(output.trim(), /^\d+$/, 'Expected one numeric SQL result')
    return Number(output.trim())
  }

  async function counts() {
    const {output} = await sql(Object.keys(expected).map(table =>
      `SELECT '${table}|' || COUNT(*) FROM ${table};`).join('\n'))
    return Object.fromEntries([...output.matchAll(/^\s*([A-Z_]+)\|(\d+)\s*$/gm)]
      .map(([, table, count]) => [table, Number(count)]))
  }

  async function reset() {
    const {status, codes} = await sql(source, {scriptControlsErrors: true})
    assert.equal(status, 0, `Reset failed: ${codes.join(', ')}`)
    assert.deepEqual(codes, [])
    assert.deepEqual(await counts(), expected)
  }

  await sql(`CREATE USER ${schema} IDENTIFIED BY "${password}";`, {admin: true})
  try {
    await sql(`GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE TO ${schema};
      ALTER USER ${schema} QUOTA 32M ON USERS;`, {admin: true})

    await t.test('seed loads all 11 tables with the expected counts', reset)

    await t.test('repeated reset removes legacy order lines and their foreign keys', async () => {
      await sql(`CREATE TABLE ORDER_PRODUCTS (
        ORDER_ID NUMBER REFERENCES ORDERS(ID), PRODUCT_ID NUMBER REFERENCES PRODUCTS(ID));
        INSERT INTO ORDER_PRODUCTS SELECT MIN(o.ID), MIN(p.ID) FROM ORDERS o CROSS JOIN PRODUCTS p;
        COMMIT;`)
      await reset()
      assert.equal(await scalar("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='ORDER_PRODUCTS';"), 0)
      assert.equal(await scalar("SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE TABLE_NAME='ORDER_PRODUCTS';"), 0)
    })

    await t.test('seed totals, payments and dates are consistent', async () => {
      const queries = [
        'SELECT COUNT(*) FROM ORDERS o WHERE o.TOTAL <> (SELECT SUM(i.PRICE*i.QUANTITY) FROM ORDER_ITEMS i WHERE i.ORDER_ID=o.ID)',
        'SELECT COUNT(*) FROM ORDERS o WHERE NOT EXISTS (SELECT 1 FROM ORDER_ITEMS i WHERE i.ORDER_ID=o.ID)',
        'SELECT COUNT(*) FROM PAYMENTS p JOIN ORDERS o ON o.ID=p.ORDER_ID WHERE p.AMOUNT<>o.TOTAL',
        'SELECT COUNT(*) FROM ORDERS WHERE UPDATED_AT<CREATED_AT OR CREATED_AT>SYSTIMESTAMP OR UPDATED_AT>SYSTIMESTAMP',
        "SELECT COUNT(*) FROM CMS_PAGES WHERE STATUS='PUBLISHED' AND (PUBLISHED_AT IS NULL OR PUBLISHED_AT>SYSTIMESTAMP)",
      ]
      for (const query of queries) assert.equal(await scalar(query + ';'), 0)
    })

    await t.test('invalid amounts, quantities and ratings are rejected by Oracle', async () => {
      const cases = [
        ['PRODUCTS', 'PRICE', -1], ['ORDERS', 'TOTAL', -1],
        ['ORDER_ITEMS', 'PRICE', -1], ['PAYMENTS', 'AMOUNT', -1],
        ...[-1, 0, 0.5, 1.5].map(value => ['ORDER_ITEMS', 'QUANTITY', value]),
        ...[-1, 0.5, 1.5].map(value => ['CART_ITEMS', 'QUANTITY', value]),
        ...[0, 6, 1.5].map(value => ['REVIEWS', 'RATING', value]),
      ]
      for (const [table, column, value] of cases) {
        // Fail-fast must roll back. An unrelated error is not a passing check.
        const {status, codes} = await sql(`WHENEVER SQLERROR EXIT FAILURE ROLLBACK
          UPDATE ${table} SET ${column}=${value} WHERE ROWNUM=1;
          COMMIT;`, {scriptControlsErrors: true})
        assert.notEqual(status, 0, `${table}.${column} accepted ${value}`)
        assert.deepEqual(codes, ['ORA-02290'], `${table}.${column} rejected for the wrong reason`)
      }
    })

    await t.test('zero amounts and rating boundaries remain valid', async () => {
      await sql(`UPDATE PRODUCTS SET PRICE=0 WHERE ROWNUM=1;
        UPDATE ORDERS SET TOTAL=0 WHERE ROWNUM=1;
        UPDATE ORDER_ITEMS SET PRICE=0 WHERE ROWNUM=1;
        UPDATE PAYMENTS SET AMOUNT=0 WHERE ROWNUM=1;
        UPDATE REVIEWS SET RATING=1 WHERE ROWNUM=1;
        UPDATE REVIEWS SET RATING=5 WHERE ROWNUM=1;
        ROLLBACK;`)
    })

    await t.test('actual cart MERGE supports increments, decrements and removal at zero', async () => {
      const service = fs.readFileSync(path.join(root, 'src/services/cartService.ts'), 'utf8')
      const merge = service.match(/`(MERGE INTO CART_ITEMS[\s\S]*?)`/)[1]
      const userId = await scalar('SELECT MIN(ID) FROM USERS;')
      const productId = await scalar(`SELECT MIN(ID) FROM PRODUCTS p WHERE NOT EXISTS
        (SELECT 1 FROM CART_ITEMS c WHERE c.USER_ID=${userId} AND c.PRODUCT_ID=p.ID);`)
      const predicate = `USER_ID=${userId} AND PRODUCT_ID=${productId}`
      const quantities = [2, 1, -1, -2, -1, 1, -5]
      const expectedQuantities = [2, 3, 2, 0, 0, 1, 0]
      let statements = ''
      quantities.forEach((quantity, index) => {
        statements += merge.replace(/:(userId|productId|quantity)\b/g,
          (_, key) => String({userId, productId, quantity}[key])) + ';\nCOMMIT;\n'
        statements += `SELECT 'STEP${index}|' || NVL(SUM(QUANTITY),0) FROM CART_ITEMS WHERE ${predicate};\n`
        statements += `SELECT 'ROWS${index}|' || COUNT(*) FROM CART_ITEMS WHERE ${predicate};\n`
      })
      const {output} = await sql(statements + 'ROLLBACK;')
      const actual = [...output.matchAll(/STEP\d+\|(\d+)/g)].map(([, amount]) => Number(amount))
      assert.deepEqual(actual, expectedQuantities)
      assert.deepEqual([...output.matchAll(/ROWS\d+\|(\d+)/g)].map(([, count]) => Number(count)),
        expectedQuantities.map(amount => amount > 0 ? 1 : 0))
      assert.deepEqual(await counts(), expected)
    })

    await t.test('a DDL error stops the reset with a nonzero exit status', async () => {
      const failing = source.replace('CREATE TABLE CATEGORIES (', 'CREATE TABLE CATEGORIES (\nINVALID_COLUMN NO_SUCH_TYPE,')
      assert(failing !== source, 'DDL failure injection point is missing')
      const {status, codes} = await sql(failing, {scriptControlsErrors: true})
      assert.notEqual(status, 0)
      assert(codes.includes('ORA-00902'), 'Expected the injected invalid datatype error')
      assert.equal(await scalar('SELECT COUNT(*) FROM USER_TABLES;'), 0)
    })

    await t.test('schema-only bootstrap remains compatible with setup-local', async () => {
      const ddl = source.slice(source.indexOf('-- Categories\n'), source.indexOf('-- Seed data'))
      assert(ddl)
      // The workspace setup uses this boundary and statement splitting strategy.
      assert.doesNotMatch(ddl.replace(/ON DELETE CASCADE/g, ''), /DROP\s|DELETE\s|TRUNCATE\s/i)
      const statements = ddl.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)
      for (const statement of statements) await sql(statement + ';')
      assert.deepEqual(await counts(), Object.fromEntries(Object.keys(expected).map(table => [table, 0])))
    })

    await t.test('a seed error exits nonzero and rolls back pending DML', async () => {
      const marker = '  -- Product catalog'
      assert.equal(source.split(marker).length, 2)
      const failing = source
        .replace('-- Seed data', "INSERT INTO CATEGORIES (NAME) VALUES ('SQL_TEST_PENDING');\n-- Seed data")
        .replace(marker, "  RAISE_APPLICATION_ERROR(-20001, 'Intentional test failure');\n" + marker)
      const {status, codes} = await sql(failing, {scriptControlsErrors: true})
      assert.notEqual(status, 0)
      assert(codes.includes('ORA-20001'))
      assert.deepEqual(await counts(), Object.fromEntries(Object.keys(expected).map(table => [table, 0])))
    })
  } finally {
    // Only this generated schema is ever removed, including after failed checks.
    assert.match(schema, /^SX_TEST_[A-F0-9]{12}$/)
    await sql(`DROP USER ${schema} CASCADE;`, {admin: true})
    t.diagnostic('Temporary SQL test schema removed; application schemas were not used.')
  }
})

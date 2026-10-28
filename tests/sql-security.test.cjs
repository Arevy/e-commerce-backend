const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'),
  ts = require('typescript')
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  )
const {
  assertPlatformDatabaseIdentity,
} = require('../src/config/platformDatabaseIdentity.ts')
test('managed backend refuses another tenant, altered schema and administrative sessions', () => {
  const p = 'sx_123456abcdef',
    s = 'SX_P_123456ABCDEF'
  assert.doesNotThrow(() => assertPlatformDatabaseIdentity(p, s, s, 'FALSE'))
  assert.throws(
    () => assertPlatformDatabaseIdentity(p, s, s, 'FALSE', 1),
    /identity/,
  )
  for (const args of [
    [p, 'SYSTEM', 'SYSTEM', 'TRUE'],
    [p, s, 'SX_P_ABCDEF123456', 'FALSE'],
    [p, s, s, 'TRUE'],
    ["sx_bad';--", s, s, 'FALSE'],
  ])
    assert.throws(() => assertPlatformDatabaseIdentity(...args), /identity/)
  assert.doesNotThrow(() =>
    assertPlatformDatabaseIdentity(undefined, 'LEGACY', 'LEGACY', 'FALSE'),
  )
})
test('product search and pagination bind user input instead of constructing SQL from it', async () => {
  let closed = false
  const hostile = "' OR 1=1 --"
  const db = require.resolve('../src/config/database.ts')
  require.cache[db] = {
    id: db,
    filename: db,
    loaded: true,
    exports: {
      getConnectionFromPool: async () => ({
        execute: async (sql, binds) => {
          assert(!sql.includes(hostile))
          assert.match(sql, /:name/)
          assert.match(sql, /:limit/)
          assert.match(sql, /:offset/)
          assert.equal(binds.name, '%' + hostile.toLowerCase() + '%')
          assert.equal(binds.categoryId, 3)
          assert.equal(binds.limit, 20)
          assert.equal(binds.offset, 0)
          return { rows: [] }
        },
        close: async () => {
          closed = true
        },
      }),
    },
  }
  const { ProductService } = require('../src/services/productService.ts')
  assert.deepEqual(await ProductService.getAll(20, 0, hostile, 3), [])
  assert(closed)
})

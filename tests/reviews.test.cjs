const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, esModuleInterop: true}},
).outputText, filename);
const dbPath = require.resolve('../src/config/database.ts');
let connection;
require.cache[dbPath] = {id: dbPath, filename: dbPath, loaded: true, exports: {getConnectionFromPool: async () => connection}};
const {ReviewService} = require('../src/services/reviewService.ts');
const {reviewResolver} = require('../src/graphql/resolvers/reviewResolver.ts');
const old = [1, 7, 9, 5, 'Old model feedback', '2025-01-01T00:00:00Z'];
const recent = [2, 7, 9, 4, 'New model feedback', '2026-10-12T12:00:00Z'];

test('public product reviews use the model cutoff; admin history remains complete', async () => {
  const cutoff = new Date('2026-10-12T11:00:00Z');
  let closed = 0;
  connection = {
    async execute(sql, binds) {
      if (sql.includes('SHOPX_CATALOG_SOURCES')) return {rows: [[cutoff]]};
      assert.equal(binds.productId, 7);
      if (sql.includes('CREATED_AT >= :modelChangedAt')) {
        assert.equal(binds.modelChangedAt, cutoff);
        return {rows: [recent]};
      }
      return {rows: [recent, old]};
    },
    async close() {closed++;},
  };
  assert.deepEqual((await reviewResolver.Query.getReviews(null, {productId: '7'})).map(r => r.id), [2]);
  assert.deepEqual((await ReviewService.getAll({productId: 7})).map(r => r.id), [2, 1]);
  assert.equal(closed, 2);
});

test('standalone schemas without the optional catalog table retain reviews', async () => {
  let closed = false;
  connection = {
    async execute(sql) {
      if (sql.includes('SHOPX_CATALOG_SOURCES')) throw new Error('ORA-00942: table does not exist');
      assert(!sql.includes('modelChangedAt'));
      return {rows: [old]};
    },
    async close() {closed = true;},
  };
  assert.equal((await ReviewService.getByProduct(7))[0].id, 1);
  assert(closed);
});

test('unexpected metadata failures propagate and release the connection', async () => {
  let closed = false;
  connection = {
    async execute() {throw new Error('ORA-03113: connection lost');},
    async close() {closed = true;},
  };
  await assert.rejects(ReviewService.getByProduct(7), /ORA-03113/);
  assert(closed);
});

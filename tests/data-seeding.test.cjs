const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {validateDataset, assertPreserved, defaultDataset} = require('../scripts/seed-data.cjs');
const source = JSON.parse(fs.readFileSync(defaultDataset, 'utf8'));

test('starter data has valid references and no committed credentials', () => {
  assert.equal(validateDataset(source), source);
  assert.equal(source.products.length, 12);
  assert.deepEqual([...new Set(source.accounts.map(account => account.role))].sort(), ['CUSTOMER', 'SUPPORT']);
});

test('invalid data is rejected before database writes', () => {
  const changes = [
    data => {data.products[0].price = -1;},
    data => {data.products[0].price = 1.005;},
    data => {data.products[0].category = 'missing';},
    data => {data.products[1].name = data.products[0].name;},
    data => {data.orders[0].lines[0].quantity = 0.5;},
    data => {data.orders[0].account = 'general-admin';},
    data => {data.reviews[0].rating = 6;},
    data => {data.cart.push({...data.cart[0]});},
    data => {data.accounts[0].role = 'SUPER_ADMIN';},
    data => {data.accounts[0].password = 'must-not-be-versioned';},
    data => {data.cms[0].status = 'UNKNOWN';},
  ];
  for (const change of changes) { const data = structuredClone(source); change(data); assert.throws(() => validateDataset(data)); }
});

test('preservation detects edits, deleted rows and duplicate-row loss', () => {
  const before = {USERS: [{ID: 1, PASSWORD: 'hash-a'}], ORDER_PRODUCTS: [{ID: 1}, {ID: 1}]};
  assertPreserved(before, {...before, USERS: [...before.USERS, {ID: 2, PASSWORD: 'hash-b'}]});
  assert.throws(() => assertPreserved(before, {...before, USERS: [{ID: 1, PASSWORD: 'changed'}]}));
  assert.throws(() => assertPreserved(before, {...before, ORDER_PRODUCTS: [{ID: 1}]}));
});

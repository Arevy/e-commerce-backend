const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {validateCatalog,imageType,defaultCatalog} = require('../scripts/refresh-catalog.cjs');
const catalog = JSON.parse(fs.readFileSync(defaultCatalog,'utf8'));

test('reviewed catalog covers all 45 replacements with EUR sources and distinct photos', () => {
  validateCatalog(catalog);
  assert.equal(catalog.products.length,45);
  assert.equal(new Set(catalog.products.map(p=>p.image.sha256)).size,45);
  assert.equal(new Set(catalog.products.map(p=>p.category)).size,14);
});

test('rejects ambiguous replacements, unverified images and invalid prices', () => {
  for(const change of [c=>c.products.push(c.products[0]), c=>c.products[0].price=-1,
    c=>c.products[0].price=1.001, c=>c.products[0].source.currency='USD',
    c=>c.products[0].source.taxIncluded=false, c=>c.products[0].image.sha256='',
    c=>c.products[0].source.checkedAt='2099-01-01', c=>c.products[0].image.url='http://example.com/image.jpg']) {
    const bad=structuredClone(catalog); change(bad); assert.throws(()=>validateCatalog(bad));
  }
});

test('rejects an HTML error response masquerading as a product photograph', () => {
  assert.throws(()=>imageType(Buffer.from('<!DOCTYPE html><html>Supplier error</html>')),/Unsupported image/);
  assert.throws(()=>imageType(Buffer.alloc(5*1024*1024+1)),/5 MiB/);
});

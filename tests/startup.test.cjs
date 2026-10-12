const {test} = require('node:test');
const assert = require('node:assert/strict');
const {waitForServices, checkDatabase} = require('../scripts/wait-for-services.cjs');

test('container startup waits until dependencies actually recover', async () => {
  let attempts = 0, clock = 0;
  await waitForServices(async () => { if (++attempts < 3) throw new Error('not ready'); }, {
    timeoutMs: 100, intervalMs: 10, now: () => clock, sleep: async ms => { clock += ms; },
  });
  assert.equal(attempts, 3);
  assert.equal(clock, 20);
});

test('unavailable dependencies fail startup without exposing connection errors', async () => {
  let clock = 0;
  await assert.rejects(waitForServices(async () => { throw new Error('private connection details'); }, {
    timeoutMs: 25, intervalMs: 10, now: () => clock, sleep: async ms => { clock += ms; },
  }), {message: 'Required services did not become ready before the startup deadline.'});
  assert.equal(clock, 25);
});

test('database preflight reads the schema and closes its connection', async () => {
  let queried = false, closed = false;
  const connection = {
    execute: async sql => { assert.match(sql, /FROM PRODUCTS/); queried = true; },
    close: async () => { closed = true; },
  };
  await checkDatabase({getConnection: async () => connection}, {});
  assert(queried && closed);
});

test('preflight preserves application-owned password rotation only when explicitly configured', async () => {
  const expired = Object.assign(new Error('expired'), {errorNum: 28001});
  const oracle = {getConnection: async () => { throw expired; }};
  await assert.rejects(checkDatabase(oracle, {}), error => error === expired);
  await assert.rejects(checkDatabase(oracle, {DB_PASSWORD_ROTATE: 'true'}), error => error === expired);
  await checkDatabase(oracle, {DB_PASSWORD_ROTATE: 'true', DB_PASSWORD_NEW: 'test-only-new-value'});
  const unavailable = Object.assign(new Error('unavailable'), {errorNum: 12514});
  await assert.rejects(checkDatabase({getConnection: async () => { throw unavailable; }}, {
    DB_PASSWORD_ROTATE: 'true', DB_PASSWORD_NEW: 'test-only-new-value',
  }), error => error === unavailable);
});

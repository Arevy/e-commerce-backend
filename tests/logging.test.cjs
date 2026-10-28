const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
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
const { safeLogMessage } = require('../src/utils/logPrivacy.ts')
test('operational messages redact credentials, email, bearer tokens and URL parameters', () => {
  const line = safeLogMessage(
    'password=canary1 user@example.test Bearer canary2 https://example.test/callback?code=canary3\nforged',
  )
  for (const secret of [
    'canary1',
    'canary2',
    'canary3',
    'user@example.test',
    '\n',
  ])
    assert(!line.includes(secret))
  assert(line.includes('[REDACTED]'))
  assert(!safeLogMessage('{"password":"json-secret"}').includes('json-secret'))
  assert.equal(
    safeLogMessage('Oracle connection failed: ORA-12541'),
    'Oracle connection failed: ORA-12541',
  )
})

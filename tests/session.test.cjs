const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const crypto = require('node:crypto')
process.env.REDIS_DISABLED = 'true'
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, esModuleInterop: true}},
).outputText, filename)
const {SessionService} = require('../src/services/sessionService.ts')
const {buildSchema, graphql} = require('graphql')
const {typeDefs} = require('../src/graphql/schema.ts')
const {protectAdministrativeFields} = require('../src/graphql/authorization.ts')
const jwt = require('jsonwebtoken')

test('bearer authentication uses a live session and respects revocation', async () => {
  const session = await SessionService.createSession({userId: 7, email: 'session@shopx.test', role: 'CUSTOMER'})
  const token = SessionService.createAccessToken(session)
  assert.equal((await SessionService.getSessionFromAuthorization(`Bearer ${token}`)).userId, 7)
  assert.equal(await SessionService.getSessionFromAuthorization('Bearer invalid'), null)
  const expired = jwt.sign({sessionId: session.id, userId: 7}, process.env.JWT_SECRET, {expiresIn: -1})
  assert.equal(await SessionService.getSessionFromAuthorization(`Bearer ${expired}`), null)
  const legacy = jwt.sign({userId: 7}, process.env.JWT_SECRET)
  assert.equal(await SessionService.getSessionFromAuthorization(`Bearer ${legacy}`), null)
  await SessionService.invalidateSession(session.id)
  assert.equal(await SessionService.getSessionFromAuthorization(`Bearer ${token}`), null)
})

test('legacy administrative fields require SUPPORT just like the nested admin API', async () => {
  const schema = buildSchema(typeDefs)
  schema.getQueryType().getFields().getUsers.resolve = () => []
  protectAdministrativeFields(schema)
  for (const session of [null, {userId: 7, role: 'CUSTOMER'}]) {
    const result = await graphql({schema, source: '{ private: getUsers { id } }', contextValue: {session}})
    assert(result.errors?.length)
  }
  const allowed = await graphql({schema, source: '{ getUsers { id } }', contextValue: {session: {role: 'SUPPORT'}}})
  assert.equal(allowed.errors, undefined)
  assert.deepEqual(allowed.data.getUsers, [])
})

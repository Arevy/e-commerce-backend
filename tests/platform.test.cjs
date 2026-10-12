const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  )
const {
  validatePlatformConfiguration,
} = require('../src/services/platformService.ts')
const config = {
  platformId: 'sx_0123456789ab',
  revision: 1,
  displayName: 'Northstar',
  locale: 'en',
  currency: 'EUR',
  priceDisplay: 'gross',
  branding: { accent: '#c8ff5f', background: '#101112', surface: '#1a1d20' },
}
test('public configuration removes secrets and rejects unsupported money/identity values', () => {
  assert.deepEqual(
    validatePlatformConfiguration({
      ...config,
      databasePassword: 'not-public',
    }),
    config,
  )
  for (const change of [
    { platformId: 'AREVY' },
    { revision: 0 },
    { currency: 'USD' },
    { branding: { accent: 'url(evil)' } },
  ])
    assert.throws(() => validatePlatformConfiguration({ ...config, ...change }))
})
test('managed sessions fail closed instead of using stale memory during Redis outage', async () => {
  const redis = require('../src/config/redis.ts')
  process.env.REDIS_DISABLED = 'true'
  delete process.env.PLATFORM_ID
  await redis.cacheSet('session:test', { userId: 7 })
  process.env.PLATFORM_ID = config.platformId
  try {
    await assert.rejects(redis.cacheGet('session:test'), /unavailable/)
    await assert.rejects(redis.cacheSet('session:test', {}), /unavailable/)
    await assert.rejects(redis.cacheDel('session:test'), /unavailable/)
    assert.equal((await redis.checkRedisHealth()).ready, false)
  } finally {
    delete process.env.PLATFORM_ID
    delete process.env.REDIS_DISABLED
  }
})
test('platform identity rejects foreign JWTs even if an operator accidentally reuses a signing secret', async () => {
  const { SessionService } = require('../src/services/sessionService.ts')
  const saved = {
    id: process.env.PLATFORM_ID,
    secret: process.env.JWT_SECRET,
    getSession: SessionService.getSession,
  }
  const session = {
    id: 'test-session',
    userId: 1,
    email: 'owner@example.test',
    role: 'SUPPORT',
    createdAt: new Date().toISOString(),
  }
  let reads = 0
  SessionService.getSession = async () => {
    reads++
    return session
  }
  process.env.JWT_SECRET = require('node:crypto')
    .randomBytes(32)
    .toString('hex')
  process.env.PLATFORM_ID = config.platformId
  try {
    const token = SessionService.createAccessToken(session)
    assert.equal(
      (await SessionService.getSessionFromAuthorization('Bearer ' + token))
        .userId,
      1,
    )
    assert.equal(reads, 1)
    process.env.PLATFORM_ID = 'sx_abcdef012345'
    assert.equal(
      await SessionService.getSessionFromAuthorization('Bearer ' + token),
      null,
    )
    assert.equal(reads, 1)
  } finally {
    SessionService.getSession = saved.getSession
    if (saved.id === undefined) delete process.env.PLATFORM_ID
    else process.env.PLATFORM_ID = saved.id
    if (saved.secret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = saved.secret
  }
})
test('factory baseline refuses legacy schemas, wrong PDB and unclaimed existing data', async () => {
  const { bootstrapSchema } = require('../scripts/provision-platform.cjs')
  const setup = {
    schema: 'SX_P_0123456789AB',
    pdb: 'ORCLPDB1',
    configuration: config,
  }
  let writes = 0
  const c = {
    execute: async (sql) => {
      if (sql.includes('SYS_CONTEXT')) return { rows: [['AREVY', 'CDB$ROOT']] }
      writes++
      throw new Error('Unexpected write')
    },
  }
  await assert.rejects(bootstrapSchema(c, setup), /identity mismatch/)
  assert.equal(writes, 0)
  c.execute = async (sql) => {
    if (sql.includes('SYS_CONTEXT'))
      return { rows: [[setup.schema, setup.pdb]] }
    if (sql === 'SELECT TABLE_NAME FROM USER_TABLES')
      return { rows: [['PRODUCTS']] }
    writes++
    throw new Error('Unexpected write')
  }
  await assert.rejects(bootstrapSchema(c, setup), /non-empty schema/)
  assert.equal(writes, 0)
})
test('factory content pack contains reviewed products and no copied accounts or transactions', () => {
  const pack = require('../data/general-store-real-v1.json')
  require('../scripts/seed-data.cjs').validateDataset(pack)
  assert.equal(pack.products.length, 45)
  for (const key of [
    'accounts',
    'orders',
    'cart',
    'wishlist',
    'reviews',
    'addresses',
  ])
    assert.equal(pack[key].length, 0)
  for (const p of pack.products) assert.match(p.image.sha256, /^[a-f0-9]{64}$/)
})

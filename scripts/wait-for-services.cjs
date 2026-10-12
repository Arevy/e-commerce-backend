// Gate container startup: the dev watcher stays alive when its child fails to boot.
// Exit on a bounded dependency timeout so the container restart policy can retry.
const {setTimeout: delay} = require('node:timers/promises');

async function waitForServices(check, {timeoutMs = 180000, intervalMs = 2000, now = Date.now, sleep = delay, onRetry = () => {}} = {}) {
  const deadline = now() + timeoutMs;
  while (true) {
    try { await check(); return; }
    catch {
      if (now() >= deadline) throw new Error('Required services did not become ready before the startup deadline.');
      onRetry();
      await sleep(Math.min(intervalMs, deadline - now()));
    }
  }
}

async function checkDatabase(oracle, env = process.env) {
  let connection;
  try {
    connection = await oracle.getConnection({
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      connectString: env.DB_CONNECT_STRING,
      transportConnectTimeout: 3,
      connectTimeout: 5,
    });
    connection.callTimeout = 5000;
    await connection.execute('SELECT COUNT(*) FROM PRODUCTS WHERE ROWNUM <= 1');
  } catch (error) {
    // The application already owns explicitly enabled expired-password rotation.
    // Do not block it at the preflight gate or rotate credentials in two places.
    if (error.errorNum === 28001 && env.DB_PASSWORD_ROTATE === 'true'
        && env.DB_PASSWORD_NEW && env.DB_PASSWORD_NEW !== env.DB_PASSWORD) return;
    throw error;
  } finally { if (connection) await connection.close(); }
}

async function checkServices() {
  await checkDatabase(require('oracledb'));
  if (process.env.REDIS_DISABLED === 'true') return;
  const {createClient} = require('redis');
  const redis = createClient({url: process.env.REDIS_URL, socket: {
    ...(process.env.REDIS_URL ? {} : {host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379)}),
    connectTimeout: 3000, reconnectStrategy: false,
  }});
  redis.on('error', () => {});
  try { await redis.connect(); await redis.ping(); }
  finally { if (redis.isOpen) await redis.disconnect(); }
}

if (require.main === module) {
  for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'JWT_SECRET']) {
    if (!process.env[key]) { console.error(`Missing required setting: ${key}`); process.exit(1); }
  }
  waitForServices(checkServices, {onRetry: () => console.log('Waiting for Oracle schema and Redis before starting the API...')})
    .then(() => console.log('Oracle schema and Redis ready.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = {waitForServices, checkDatabase};

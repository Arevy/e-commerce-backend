import fs from 'node:fs'
import dotenv from 'dotenv'

dotenv.config()
// Managed containers mount secrets; standalone environment variables stay supported.
for (const key of ['DB_PASSWORD', 'JWT_SECRET', 'REDIS_URL']) {
  const file = process.env[`${key}_FILE`]
  if (file) {
    const value = fs.readFileSync(file, 'utf8').trim()
    if (!value || value.includes('\n')) throw new Error(`Invalid ${key}_FILE`)
    process.env[key] = value
  }
}

import { logger } from '../utils/logger'

type RedisClient = {
  connect: () => Promise<void>
  quit: () => Promise<void>
  get: (key: string) => Promise<string | null>
  set: (
    key: string,
    value: string,
    options?: { EX?: number; PX?: number; NX?: boolean; XX?: boolean },
  ) => Promise<unknown>
  del: (key: string) => Promise<number>
}

let client: RedisClient | null = null
let isRedisReady = false

const memoryCache = new Map<
  string,
  { value: string; expiresAt: number | null }
>()

const shouldDisableRedis = () => process.env.REDIS_DISABLED === 'true'

export const connectRedis = async () => {
  if (client || isRedisReady || shouldDisableRedis()) {
    return client
  }

  try {
    // Lazily require redis so the app can run without the package if needed.
    const redisModule = require('redis') as typeof import('redis')

    const url = process.env.REDIS_URL
    const redisClient = url
      ? redisModule.createClient({ url })
      : redisModule.createClient({
          socket: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: Number(process.env.REDIS_PORT || 6379),
          },
        })

    redisClient.on('error', (err: unknown) => {
      logger.error(`Redis error: ${JSON.stringify(err)}`)
    })

    await redisClient.connect()
    client = redisClient as unknown as RedisClient
    isRedisReady = true
    logger.info('Connected to Redis')
    return client
  } catch (error) {
    logger.warn('Redis not available. Falling back to in-memory cache.')
    client = null
    isRedisReady = false
    return null
  }
}

export const disconnectRedis = async () => {
  if (client && isRedisReady) {
    try {
      await client.quit()
      logger.info('Redis connection closed')
    } catch (error) {
      logger.error(`Failed to close Redis connection: ${error}`)
    } finally {
      client = null
      isRedisReady = false
    }
  }
}

const getNow = () => Date.now()

const getFromMemory = (key: string): string | null => {
  const cached = memoryCache.get(key)
  if (!cached) return null
  if (cached.expiresAt && cached.expiresAt < getNow()) {
    memoryCache.delete(key)
    return null
  }
  return cached.value
}

const setInMemory = (key: string, value: string, ttlSeconds?: number) => {
  const expiresAt = ttlSeconds ? getNow() + ttlSeconds * 1000 : null
  memoryCache.set(key, { value, expiresAt })
}

const deleteFromMemory = (key: string) => {
  memoryCache.delete(key)
}

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (client && isRedisReady) {
    try {
      const value = await client.get(key)
      return value ? (JSON.parse(value) as T) : null
    } catch (error) {
      logger.warn(`Redis get failed for key ${key}. Using memory cache.`)
      const value = getFromMemory(key)
      return value ? (JSON.parse(value) as T) : null
    }
  }

  const value = getFromMemory(key)
  return value ? (JSON.parse(value) as T) : null
}

export const cacheSet = async <T>(
  key: string,
  value: T,
  ttlSeconds?: number,
) => {
  const stringified = JSON.stringify(value)
  setInMemory(key, stringified, ttlSeconds)

  if (client && isRedisReady) {
    try {
      const options = ttlSeconds ? { EX: ttlSeconds } : undefined
      await client.set(key, stringified, options)
    } catch (error) {
      logger.warn(`Redis set failed for key ${key}. Falling back to memory.`)
    }
  }
}

export const cacheDel = async (key: string) => {
  deleteFromMemory(key)

  if (client && isRedisReady) {
    try {
      await client.del(key)
    } catch (error) {
      logger.warn(`Redis delete failed for key ${key}.`)
    }
  }
}

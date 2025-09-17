// @ts-ignore
import oracledb from 'oracledb'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()
let connectionPool: oracledb.Pool | null = null

export const connectToDatabase = async () => {
  if (connectionPool) {
    return connectionPool
  }

  try {
    if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_CONNECT_STRING) {
      throw new Error('Missing Oracle database configuration. Check DB_USER, DB_PASSWORD and DB_CONNECT_STRING.')
    }

    connectionPool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
      poolMin: Number(process.env.DB_POOL_MIN || 1),
      poolMax: Number(process.env.DB_POOL_MAX || 4),
      poolIncrement: Number(process.env.DB_POOL_INCREMENT || 1),
    })

    const conn = await connectionPool.getConnection()
    await conn.execute(`SELECT 1 FROM DUAL`)
    await conn.close()
    logger.info('Connected to Oracle Database')
    return connectionPool
  } catch (err) {
    logger.error(`Error connecting to Oracle Database: ${err}`)
    throw err
  }
}

export const getConnectionFromPool = async (): Promise<oracledb.Connection> => {
  if (!connectionPool) {
    await connectToDatabase()
  }
  if (!connectionPool) {
    throw new Error('Connection pool not initialized. Call connectToDatabase first.')
  }
  return connectionPool.getConnection()
}

export const closeDatabaseConnection = async () => {
  if (connectionPool) {
    try {
      await connectionPool.close(0)
      logger.info('Oracle connection pool closed')
    } catch (err) {
      logger.error(`Error closing Oracle connection pool: ${err}`)
    } finally {
      connectionPool = null
    }
  }
}

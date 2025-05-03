// @ts-ignore
import oracledb from 'oracledb'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()
let connectionPool: oracledb.Pool | null = null

export const connectToDatabase = async () => {
  try {
    logger.info('Environment Variables:', {
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_CONNECT_STRING: process.env.DB_CONNECT_STRING,
    })
    if (!connectionPool) {
      connectionPool = await oracledb.createPool({
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        connectString: process.env.DB_CONNECT_STRING!,
      })
      logger.info('Connection pool created')
    }
    const conn = await connectionPool.getConnection()
    await conn.execute(`SELECT 1 FROM DUAL`)
    await conn.close()
    logger.info('Connected to Oracle Database')
  } catch (err) {
    logger.error('Error connecting to Oracle Database:', err)
    process.exit(1)
  }
}

export const getConnectionFromPool = async (): Promise<oracledb.Connection> => {
  if (!connectionPool) {
    throw new Error(
      'Connection pool not initialized. Call connectToDatabase first.',
    )
  }
  return connectionPool.getConnection()
}

export const closeDatabaseConnection = async () => {
  if (connectionPool) {
    try {
      await connectionPool.close()
      logger.info('Connection pool closed')
    } catch (err) {
      logger.error('Error closing connection pool:', err)
    }
  }
}

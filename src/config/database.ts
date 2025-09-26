// @ts-ignore
import oracledb from 'oracledb'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'

dotenv.config()
// Ensure LOB columns (CLOB/NCLOB) are returned as plain strings.
if (Array.isArray(oracledb.fetchAsString)) {
  const fetchTypes = new Set(oracledb.fetchAsString)
  fetchTypes.add(oracledb.CLOB)
  fetchTypes.add(oracledb.NCLOB)
  oracledb.fetchAsString = Array.from(fetchTypes)
} else {
  oracledb.fetchAsString = [oracledb.CLOB, oracledb.NCLOB]
}

if (Array.isArray(oracledb.fetchAsBuffer)) {
  const bufferTypes = new Set(oracledb.fetchAsBuffer)
  bufferTypes.add(oracledb.BLOB)
  oracledb.fetchAsBuffer = Array.from(bufferTypes)
} else {
  oracledb.fetchAsBuffer = [oracledb.BLOB]
}
let connectionPool: oracledb.Pool | null = null

const isPasswordExpiredError = (error: unknown): boolean => {
  const oracleError = error as null | { errorNum?: number; message?: string }
  if (!oracleError) {
    return false
  }
  if (oracleError.errorNum === 28001) {
    return true
  }
  return typeof oracleError.message === 'string' && oracleError.message.includes('ORA-28001')
}

const createPool = async (password: string) => {
  if (!process.env.DB_USER || !process.env.DB_CONNECT_STRING) {
    throw new Error('Missing Oracle database configuration. Check DB_USER and DB_CONNECT_STRING.')
  }

  return oracledb.createPool({
    user: process.env.DB_USER,
    password,
    connectString: process.env.DB_CONNECT_STRING,
    poolMin: Number(process.env.DB_POOL_MIN || 1),
    poolMax: Number(process.env.DB_POOL_MAX || 4),
    poolIncrement: Number(process.env.DB_POOL_INCREMENT || 1),
  })
}

const rotateExpiredPassword = async (currentPassword: string, newPassword: string) => {
  if (!process.env.DB_USER || !process.env.DB_CONNECT_STRING) {
    throw new Error('Missing Oracle database configuration. Check DB_USER and DB_CONNECT_STRING.')
  }

  if (currentPassword === newPassword) {
    throw new Error(
      'DB_PASSWORD_NEW must differ from the expired DB_PASSWORD when rotating an Oracle password.',
    )
  }

  logger.warn('Oracle password expired. Attempting automatic rotation with DB_PASSWORD_NEW.')
  let connection: oracledb.Connection | null = null
  try {
    connection = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: currentPassword,
      passwordNew: newPassword,
      connectString: process.env.DB_CONNECT_STRING,
    })
    logger.info('Oracle password rotated successfully. Update your secrets to persist the change.')
  } catch (err) {
    logger.error(`Oracle password rotation failed: ${err}`)
    throw err
  } finally {
    if (connection) {
      await connection.close()
    }
  }
}

export const connectToDatabase = async () => {
  if (connectionPool) {
    return connectionPool
  }

  const currentPassword = process.env.DB_PASSWORD
  if (!currentPassword) {
    throw new Error('Missing Oracle database configuration. Check DB_PASSWORD environment variable.')
  }

  try {
    connectionPool = await createPool(currentPassword)
  } catch (error) {
    if (!isPasswordExpiredError(error)) {
      logger.error(`Error connecting to Oracle Database: ${error}`)
      throw error
    }

    if (process.env.DB_PASSWORD_ROTATE !== 'true') {
      logger.error(
        'Oracle password expired (ORA-28001). Automatic rotation disabled. Enable it by setting DB_PASSWORD_ROTATE=true and provide DB_PASSWORD_NEW.',
      )
      throw error
    }

    const nextPassword = process.env.DB_PASSWORD_NEW
    if (!nextPassword) {
      logger.error(
        'Oracle password expired (ORA-28001). Set DB_PASSWORD_NEW with the rotated credential to allow automatic reset.',
      )
      throw error
    }

    await rotateExpiredPassword(currentPassword, nextPassword)
    process.env.DB_PASSWORD = nextPassword
    connectionPool = await createPool(nextPassword)
  }

  const conn = await connectionPool.getConnection()
  await conn.execute(`SELECT 1 FROM DUAL`)
  await conn.close()
  logger.info('Connected to Oracle Database')
  return connectionPool
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

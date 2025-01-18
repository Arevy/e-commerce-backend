// @ts-ignore
import oracledb from 'oracledb'
import dotenv from 'dotenv'

dotenv.config()
let connectionPool: oracledb.Pool | null = null

export const connectToDatabase = async () => {
  try {
    console.log('Environment Variables:', {
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_CONNECT_STRING: process.env.DB_CONNECT_STRING,
    })
    if (!connectionPool) {
      connectionPool = await oracledb.createPool({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD ,
        connectString:
          process.env.DB_CONNECT_STRING,
      })
      console.log('Connection pool created')
    }

    const connection = await connectionPool.getConnection() // Obține conexiunea din pool
    console.log('Connection established for SELECT test')

    const result = await connection.execute(`SELECT 1 FROM DUAL`)
    console.log('SELECT result:', result.rows)
    await connection.close() // Eliberează conexiunea înapoi în pool
    console.log('Connected to Oracle Database')
  } catch (err) {
    console.error('Error connecting to Oracle Database:', err)
    process.exit(1)
  }
}

export const getConnectionFromPool = async (): Promise<oracledb.Connection> => {
  if (!connectionPool) {
    throw new Error(
      'Connection pool has not been initialized. Call connectToDatabase first.',
    )
  }
  return await connectionPool.getConnection()
}

export const addProductToDB = async (
  name: string,
  price: number,
  description: string,
  categoryId: number,
) => {
  try {
    console.log('addProductToDB called with:', {
      name,
      price,
      description,
      categoryId,
    })
    const connection = await getConnectionFromPool()
    const result = await connection.execute(
      `INSERT INTO PRODUCTS (NAME, PRICE, DESCRIPTION, CATEGORY_ID)
       VALUES (:name, :price, :description, :categoryId) RETURNING ID INTO :id`,
      {
        name,
        price,
        description,
        categoryId,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true },
    )
    console.log('Insert result:', result)
    await connection.close()
    return { id: result.outBinds.id[0], name, price, description }
  } catch (err) {
    console.error('Error in addProductToDB:', err)
    throw err
  }
}

export const updateProductInDB = async (
  id: number,
  name?: string,
  price?: number,
  description?: string,
) => {
  const connection = await oracledb.getConnection()
  const result = await connection.execute(
    `UPDATE PRODUCTS SET 
      NAME = COALESCE(:name, NAME),
      PRICE = COALESCE(:price, PRICE),
      DESCRIPTION = COALESCE(:description, DESCRIPTION)
    WHERE ID = :id`,
    { id, name, price, description },
    { autoCommit: true },
  )
  return result.rowsAffected > 0
}

export const deleteProductFromDB = async (id: number) => {
  const connection = await oracledb.getConnection()
  const result = await connection.execute(
    `DELETE FROM PRODUCTS WHERE ID = :id`,
    { id },
    { autoCommit: true },
  )
  return result.rowsAffected > 0
}
export const getProductsFromDB = async () => {
  try {
    console.log('getProductsFromDB called')
    const connection = await getConnectionFromPool()
    console.log('Connection established for getProductsFromDB')
    const result = await connection.execute(
      `SELECT ID, NAME, PRICE, DESCRIPTION FROM PRODUCTS`,
    )
    console.log('Query result:', result)
    await connection.close()
    return result.rows.map((row: any[]) => ({
      id: row[0],
      name: row[1],
      price: row[2],
      description: row[3],
    }))
  } catch (err) {
    console.error('Error in getProductsFromDB:', err)
    throw err
  }
}

export const closeDatabaseConnection = async () => {
  if (connectionPool) {
    try {
      await connectionPool.close()
      console.log('Connection pool closed')
    } catch (err) {
      console.error('Error closing connection pool:', err)
    }
  }
}

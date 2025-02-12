// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { OrderProduct } from '../models/order'
import { logger } from '../utils/logger'

export const OrderService = {
  createOrder: async (userId: number, products: OrderProduct[]) => {
    const connection = await getConnectionFromPool()
    const total = products.reduce((acc, p) => acc + p.price * p.quantity, 0)

    try {
      const result = await connection.execute(
        `INSERT INTO ORDERS (USER_ID, TOTAL, STATUS) 
         VALUES (:userId, :total, 'PENDING') 
         RETURNING ID INTO :orderId`,
        {
          userId,
          total,
          orderId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )

      const orderId = result.outBinds.orderId[0]

      for (const product of products) {
        await connection.execute(
          `INSERT INTO ORDER_PRODUCTS (ORDER_ID, PRODUCT_ID, QUANTITY, PRICE) 
           VALUES (:orderId, :productId, :quantity, :price)`,
          {
            orderId,
            productId: product.productId,
            quantity: product.quantity,
            price: product.price,
          },
          { autoCommit: true },
        )
      }

      logger.info('Order created:', { orderId, userId, total })
      return { id: orderId, userId, total, status: 'PENDING' }
    } catch (err) {
      logger.error('Error creating order:', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  getOrders: async (userId: number) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `SELECT ID, TOTAL, STATUS, CREATED_AT, UPDATED_AT 
         FROM ORDERS WHERE USER_ID = :userId`,
        { userId },
      )
      return result.rows.map((row: any[]) => ({
        id: row[0],
        total: row[1],
        status: row[2],
        createdAt: row[3],
        updatedAt: row[4],
      }))
    } finally {
      await connection.close()
    }
  },

  updateOrderStatus: async (orderId: number, status: string) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `UPDATE ORDERS SET STATUS = :status, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = :orderId`,
        { orderId, status },
        { autoCommit: true },
      )
      return result.rowsAffected > 0
    } finally {
      await connection.close()
    }
  },

  deleteOrder: async (orderId: number) => {
    const connection = await getConnectionFromPool()
    try {
      await connection.execute(
        `DELETE FROM ORDER_PRODUCTS WHERE ORDER_ID = :orderId`,
        { orderId },
        { autoCommit: true },
      )
      const result = await connection.execute(
        `DELETE FROM ORDERS WHERE ID = :orderId`,
        { orderId },
        { autoCommit: true },
      )

      return result.rowsAffected > 0
    } catch (err) {
      throw err
    } finally {
      await connection.close()
    }
  },
}

// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { logger } from '../utils/logger'

export interface OrderProductInput {
  productId: number
  quantity: number
  price: number
}

export const OrderService = {
  create: async (userId: number, products: OrderProductInput[]) => {
    const conn = await getConnectionFromPool()
    try {
      // 1) calculează total
      const total = products.reduce((sum, p) => sum + p.price * p.quantity, 0)

      // 2) inserează în ORDERS
      const resOrder = await conn.execute(
        `INSERT INTO ORDERS (USER_ID, TOTAL, STATUS, CREATED_AT, UPDATED_AT)
         VALUES (:uid, :tot, 'PENDING', SYSTIMESTAMP, SYSTIMESTAMP)
         RETURNING ID INTO :oid`,
        {
          uid: userId,
          tot: total,
          oid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: false },
      )
      const orderId = resOrder.outBinds.oid[0] as number

      // 3) inserează fiecare item
      for (const p of products) {
        await conn.execute(
          `INSERT INTO ORDER_ITEMS (ORDER_ID, PRODUCT_ID, QUANTITY, PRICE)
           VALUES (:oid, :pid, :qty, :pr)`,
          {
            oid: orderId,
            pid: p.productId,
            qty: p.quantity,
            pr: p.price,
          },
        )
      }

      // 4) commit
      await conn.commit()

      return {
        id: orderId,
        userId,
        total,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        products,
      }
    } catch (err) {
      logger.error('Error in OrderService.create:', err)
      await conn.rollback()
      throw err
    } finally {
      await conn.close()
    }
  },

  updateStatus: async (orderId: number, status: string) => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `UPDATE ORDERS SET STATUS = :st, UPDATED_AT = SYSTIMESTAMP WHERE ID = :oid`,
        { st: status, oid: orderId },
        { autoCommit: true },
      )
      return res.rowsAffected === 1
    } finally {
      await conn.close()
    }
  },

  delete: async (orderId: number) => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `DELETE FROM ORDER_ITEMS WHERE ORDER_ID = :oid`,
        { oid: orderId },
        { autoCommit: false },
      )
      const res = await conn.execute(
        `DELETE FROM ORDERS WHERE ID = :oid`,
        { oid: orderId },
        { autoCommit: true },
      )
      return res.rowsAffected === 1
    } finally {
      await conn.close()
    }
  },

  getByUser: async (userId: number) => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `SELECT ID, TOTAL, STATUS, CREATED_AT, UPDATED_AT
         FROM ORDERS WHERE USER_ID = :uid`,
        { uid: userId },
      )
      return res.rows.map((r: any[]) => ({
        id: r[0],
        userId,
        total: r[1],
        status: r[2],
        createdAt: r[3],
        updatedAt: r[4],
      }))
    } finally {
      await conn.close()
    }
  },
}

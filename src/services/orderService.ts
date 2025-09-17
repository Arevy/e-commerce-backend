// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { logger } from '../utils/logger'

export interface OrderProductInput {
  productId: number
  quantity: number
  price: number
}

interface OrderRow {
  id: number
  userId: number
  total: number
  status: string
  createdAt: string
  updatedAt: string
}

interface OrderItemRow {
  orderId: number
  productId: number
  quantity: number
  price: number
}

const mapOrderRow = (row: any[]): OrderRow => ({
  id: row[0],
  userId: row[1],
  total: row[2],
  status: row[3],
  createdAt: row[4],
  updatedAt: row[5],
})

const mapOrderItemRow = (row: any[]): OrderItemRow => ({
  orderId: row[0],
  productId: row[1],
  quantity: row[2],
  price: row[3],
})

const fetchOrderWithItems = async (orderId: number) => {
  const conn = await getConnectionFromPool()
  try {
    const orderRes = await conn.execute(
      `SELECT ID, USER_ID, TOTAL, STATUS, TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT,
              TO_CHAR(UPDATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS UPDATED_AT
         FROM ORDERS WHERE ID = :oid`,
      { oid: orderId },
    )
    if (!orderRes.rows?.length) {
      return null
    }
    const order = mapOrderRow(orderRes.rows[0] as any[])

    const itemsRes = await conn.execute(
      `SELECT ORDER_ID, PRODUCT_ID, QUANTITY, PRICE FROM ORDER_ITEMS WHERE ORDER_ID = :oid`,
      { oid: orderId },
    )
    const products = (itemsRes.rows || []).map((row: any[]) =>
      mapOrderItemRow(row),
    )

    return { ...order, products }
  } finally {
    await conn.close()
  }
}

export const OrderService = {
  create: async (userId: number, products: OrderProductInput[]) => {
    const conn = await getConnectionFromPool()
    let orderId: number | null = null
    try {
      const total = products.reduce(
        (sum, p) => sum + p.price * p.quantity,
        0,
      )

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
      orderId = (resOrder.outBinds as any).oid[0]

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
          { autoCommit: false },
        )
      }

      await conn.commit()
    } catch (err) {
      try {
        await conn.rollback()
      } catch (rollbackError) {
        logger.error(`Rollback failed in OrderService.create: ${rollbackError}`)
      }
      logger.error(`Error in OrderService.create: ${err}`)
      throw err
    } finally {
      await conn.close()
    }

    if (!orderId) {
      throw new Error('Order creation failed')
    }

    const createdOrder = await fetchOrderWithItems(orderId)
    if (!createdOrder) {
      throw new Error('Failed to load created order')
    }
    return createdOrder
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
    } catch (err) {
      logger.error(`Error in OrderService.updateStatus: ${err}`)
      throw err
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
        { autoCommit: false },
      )
      await conn.commit()
      return res.rowsAffected === 1
    } catch (err) {
      try {
        await conn.rollback()
      } catch (rollbackError) {
        logger.error(`Rollback failed in OrderService.delete: ${rollbackError}`)
      }
      logger.error(`Error in OrderService.delete: ${err}`)
      throw err
    } finally {
      await conn.close()
    }
  },

  getByUser: async (userId: number) => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `SELECT ID, USER_ID, TOTAL, STATUS,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                TO_CHAR(UPDATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
           FROM ORDERS
          WHERE USER_ID = :uid
          ORDER BY CREATED_AT DESC`,
        { uid: userId },
      )

      const orders = (res.rows || []).map((row: any[]) => mapOrderRow(row))
      if (!orders.length) {
        return []
      }

      const placeholders = orders
        .map((_order: OrderRow, idx: number) => `:orderId${idx}`)
        .join(', ')
      const params = orders.reduce<Record<string, unknown>>(
        (acc: Record<string, unknown>, order: OrderRow, idx: number) => {
          acc[`orderId${idx}`] = order.id
          return acc
        },
        {},
      )
      const itemsRes = await conn.execute(
        `SELECT ORDER_ID, PRODUCT_ID, QUANTITY, PRICE
           FROM ORDER_ITEMS
          WHERE ORDER_ID IN (${placeholders})`,
        params,
      )
      const items = (itemsRes.rows || []).map((row: any[]) =>
        mapOrderItemRow(row),
      )

      const itemsByOrder = items.reduce<
        Record<number, OrderItemRow[]>
      >(
        (acc: Record<number, OrderItemRow[]>, item: OrderItemRow) => {
          if (!acc[item.orderId]) {
            acc[item.orderId] = []
          }
          acc[item.orderId].push(item)
          return acc
        },
        {},
      )

      return orders.map((order: OrderRow) => ({
        ...order,
        products: itemsByOrder[order.id] || [],
      }))
    } catch (err) {
      logger.error(`Error in OrderService.getByUser: ${err}`)
      throw err
    } finally {
      await conn.close()
    }
  },
}

// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { Payment } from '../models/payment'

const mapPaymentRow = (row: any[]): Payment => ({
  id: row[0],
  orderId: row[1],
  amount: row[2],
  method: row[3],
  status: row[4],
  createdAt: row[5],
})

const fetchPaymentById = async (paymentId: number) => {
  const conn = await getConnectionFromPool()
  try {
    const res = await conn.execute(
      `SELECT ID,
              ORDER_ID,
              AMOUNT,
              METHOD,
              STATUS,
              TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         FROM PAYMENTS WHERE ID=:pid`,
      { pid: paymentId },
    )
    if (!res.rows?.length) return null
    return mapPaymentRow(res.rows[0] as any[])
  } finally {
    await conn.close()
  }
}

export const PaymentService = {
  create: async (
    orderId: number,
    amount: number,
    method: string,
  ): Promise<Payment> => {
    const conn = await getConnectionFromPool()
    let paymentId: number | null = null
    try {
      const res = await conn.execute(
        `INSERT INTO PAYMENTS (ORDER_ID, AMOUNT, METHOD, STATUS, CREATED_AT)
         VALUES (:oid,:amt,:mtd,'PENDING',SYSTIMESTAMP)
         RETURNING ID INTO :pid`,
        {
          oid: orderId,
          amt: amount,
          mtd: method,
          pid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )
      paymentId = (res.outBinds as any).pid[0]
    } finally {
      await conn.close()
    }

    if (!paymentId) {
      throw new Error('Failed to create payment')
    }

    const created = await fetchPaymentById(paymentId)
    if (!created) {
      throw new Error('Failed to load created payment')
    }
    return created
  },

  getById: async (paymentId: number): Promise<Payment | null> => {
    return fetchPaymentById(paymentId)
  },

  updateStatus: async (
    paymentId: number,
    status: string,
  ): Promise<Payment> => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `UPDATE PAYMENTS SET STATUS = :status WHERE ID = :pid`,
        { status, pid: paymentId },
        { autoCommit: true },
      )
      if (!res.rowsAffected) {
        throw new Error(`Payment ${paymentId} not found`)
      }
    } finally {
      await conn.close()
    }

    const updated = await fetchPaymentById(paymentId)
    if (!updated) {
      throw new Error(`Payment ${paymentId} not found after update`)
    }
    return updated
  },

  remove: async (paymentId: number): Promise<boolean> => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `DELETE FROM PAYMENTS WHERE ID = :pid`,
        { pid: paymentId },
        { autoCommit: true },
      )
      return (res.rowsAffected || 0) > 0
    } finally {
      await conn.close()
    }
  },
}

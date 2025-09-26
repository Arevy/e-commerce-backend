// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { Review } from '../models/review'
import { logger } from '../utils/logger'

const isMissingTableError = (err: unknown) =>
  err instanceof Error && err.message.includes('ORA-00942')

const mapReviewRow = (row: any[]): Review => ({
  id: row[0],
  productId: row[1],
  userId: row[2],
  rating: row[3],
  reviewText: row[4],
  createdAt: row[5],
})

const fetchReviewById = async (reviewId: number) => {
  const conn = await getConnectionFromPool()
  try {
    const res = await conn.execute(
      `SELECT ID,
              PRODUCT_ID,
              USER_ID,
              RATING,
              REVIEW_TEXT,
              TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         FROM REVIEWS WHERE ID = :rid`,
      { rid: reviewId },
    )
    if (!res.rows?.length) {
      return null
    }
    return mapReviewRow(res.rows[0] as any[])
  } catch (err) {
    if (isMissingTableError(err)) {
      logger.warn('REVIEWS table not found when fetching review by id.')
      return null
    }
    throw err
  } finally {
    await conn.close()
  }
}

export const ReviewService = {
  getAll: async (filters?: {
    productId?: number
    userId?: number
  }): Promise<Review[]> => {
    const conn = await getConnectionFromPool()
    try {
      const where: string[] = []
      const params: Record<string, unknown> = {}

      if (filters?.productId !== undefined) {
        where.push('PRODUCT_ID = :productId')
        params.productId = filters.productId
      }
      if (filters?.userId !== undefined) {
        where.push('USER_ID = :userId')
        params.userId = filters.userId
      }

      let query = `SELECT ID,
                PRODUCT_ID,
                USER_ID,
                RATING,
                REVIEW_TEXT,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
           FROM REVIEWS`

      if (where.length) {
        query += ` WHERE ${where.join(' AND ')}`
      }

      query += ' ORDER BY CREATED_AT DESC'

      const res = await conn.execute(query, params)
      return (res.rows || []).map((row: any[]) => mapReviewRow(row))
    } catch (err) {
      if (isMissingTableError(err)) {
        logger.warn('REVIEWS table not found. Returning empty review list.')
        return []
      }
      throw err
    } finally {
      await conn.close()
    }
  },

  getByProduct: async (productId: number): Promise<Review[]> => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `SELECT ID,
                PRODUCT_ID,
                USER_ID,
                RATING,
                REVIEW_TEXT,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
           FROM REVIEWS
          WHERE PRODUCT_ID = :productId
          ORDER BY CREATED_AT DESC`,
        { productId },
      )
      return (res.rows || []).map((row: any[]) => mapReviewRow(row))
    } catch (err) {
      if (isMissingTableError(err)) {
        logger.warn('REVIEWS table not found when fetching reviews by product.')
        return []
      }
      throw err
    } finally {
      await conn.close()
    }
  },

  add: async (
    productId: number,
    userId: number,
    rating: number,
    reviewText?: string,
  ): Promise<Review> => {
    const conn = await getConnectionFromPool()
    let reviewId: number | null = null
    try {
      const res = await conn.execute(
        `INSERT INTO REVIEWS (PRODUCT_ID, USER_ID, RATING, REVIEW_TEXT, CREATED_AT)
         VALUES (:productId, :userId, :rating, :comment, SYSTIMESTAMP)
         RETURNING ID INTO :reviewId`,
        {
          productId,
          userId,
          rating,
          comment: reviewText,
          reviewId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )
      reviewId = (res.outBinds as any).reviewId[0]
    } finally {
      await conn.close()
    }

    if (!reviewId) {
      throw new Error('Failed to create review')
    }

    const created = await fetchReviewById(reviewId)
    if (!created) {
      throw new Error('Failed to load created review')
    }
    return created
  },

  update: async (
    reviewId: number,
    rating?: number,
    reviewText?: string,
  ): Promise<Review> => {
    const conn = await getConnectionFromPool()
    try {
      const fields: string[] = []
      const params: Record<string, unknown> = { reviewId }

      if (rating !== undefined) {
        fields.push('RATING = :rating')
        params.rating = rating
      }
      if (reviewText !== undefined) {
        fields.push('REVIEW_TEXT = :comment')
        params.comment = reviewText
      }

      if (!fields.length) {
        throw new Error('Nothing to update for review')
      }

      const res = await conn.execute(
        `UPDATE REVIEWS SET ${fields.join(', ')}, UPDATED_AT = SYSTIMESTAMP WHERE ID = :reviewId`,
        params,
        { autoCommit: true },
      )
      if (!res.rowsAffected) {
        throw new Error(`Review ${reviewId} not found`)
      }
    } finally {
      await conn.close()
    }

    const updated = await fetchReviewById(reviewId)
    if (!updated) {
      throw new Error(`Review ${reviewId} not found after update`)
    }
    return updated
  },

  delete: async (reviewId: number): Promise<boolean> => {
    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `DELETE FROM REVIEWS WHERE ID = :rid`,
        { rid: reviewId },
        { autoCommit: true },
      )
      return (res.rowsAffected || 0) > 0
    } finally {
      await conn.close()
    }
  },

  getById: async (reviewId: number): Promise<Review | null> =>
    fetchReviewById(reviewId),
}

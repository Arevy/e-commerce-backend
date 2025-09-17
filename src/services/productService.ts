// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { logger } from '../utils/logger'
import { Product } from '../models/product'

const PRODUCT_SELECT = `
  SELECT
    p.ID,
    p.NAME,
    p.PRICE,
    p.DESCRIPTION,
    p.CATEGORY_ID,
    c.ID,
    c.NAME,
    c.DESCRIPTION
  FROM PRODUCTS p
  LEFT JOIN CATEGORIES c ON c.ID = p.CATEGORY_ID
`

const mapProductRow = (row: any[]): Product => ({
  id: row[0],
  name: row[1],
  price: row[2],
  description: row[3],
  categoryId: row[4],
  category: row[5]
    ? {
        id: row[5],
        name: row[6],
        description: row[7],
      }
    : null,
})

export const ProductService = {
  getAll: async (
    limit?: number,
    offset?: number,
    name?: string,
    categoryId?: number,
  ): Promise<Product[]> => {
    const connection = await getConnectionFromPool()
    try {
      const params: Record<string, unknown> = {}
      const filters: string[] = []

      if (name) {
        filters.push('LOWER(p.NAME) LIKE :name')
        params.name = `%${name.toLowerCase()}%`
      }
      if (typeof categoryId === 'number') {
        filters.push('p.CATEGORY_ID = :categoryId')
        params.categoryId = categoryId
      }

      let query = PRODUCT_SELECT
      if (filters.length) {
        query += ` WHERE ${filters.join(' AND ')}`
      }
      query += ' ORDER BY p.ID'

      const pagination: string[] = []
      if (typeof offset === 'number') {
        pagination.push('OFFSET :offset ROWS')
        params.offset = offset
      }
      if (typeof limit === 'number') {
        pagination.push('FETCH NEXT :limit ROWS ONLY')
        params.limit = limit
      }
      if (pagination.length) {
        query += ` ${pagination.join(' ')}`
      }

      const result = await connection.execute(query, params)
      return (result.rows || []).map((row: any[]) => mapProductRow(row))
    } catch (err) {
      logger.error(`Error in ProductService.getAll: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },

  getById: async (id: number): Promise<Product | null> => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `${PRODUCT_SELECT} WHERE p.ID = :id`,
        { id },
      )
      if (!result.rows?.length) return null
      return mapProductRow(result.rows[0] as any[])
    } catch (err) {
      logger.error(`Error in ProductService.getById: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },

  add: async (
    name: string,
    price: number,
    description: string | undefined,
    categoryId: number,
  ): Promise<Product> => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `INSERT INTO PRODUCTS (NAME, PRICE, DESCRIPTION, CATEGORY_ID)
         VALUES (:name, :price, :description, :categoryId)
         RETURNING ID INTO :id`,
        {
          name,
          price,
          description,
          categoryId,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )

      const newId = (result.outBinds as any).id[0]
      const created = await ProductService.getById(newId)
      if (!created) {
        throw new Error('Failed to load created product')
      }
      return created
    } catch (err) {
      logger.error(`Error in ProductService.add: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },

  update: async (
    id: number,
    name?: string,
    price?: number,
    description?: string,
    categoryId?: number,
  ): Promise<Product> => {
    const connection = await getConnectionFromPool()
    try {
      const fields: string[] = []
      const params: Record<string, unknown> = { id }

      if (name !== undefined) {
        fields.push('NAME = :name')
        params.name = name
      }
      if (price !== undefined) {
        fields.push('PRICE = :price')
        params.price = price
      }
      if (description !== undefined) {
        fields.push('DESCRIPTION = :description')
        params.description = description
      }
      if (categoryId !== undefined) {
        fields.push('CATEGORY_ID = :categoryId')
        params.categoryId = categoryId
      }

      if (!fields.length) {
        throw new Error('Nothing to update for product')
      }

      const result = await connection.execute(
        `UPDATE PRODUCTS SET ${fields.join(', ')} WHERE ID = :id`,
        params,
        { autoCommit: true },
      )

      if (!result.rowsAffected) {
        throw new Error(`Product ${id} not found`)
      }
    } catch (err) {
      logger.error(`Error in ProductService.update: ${err}`)
      throw err
    } finally {
      await connection.close()
    }

    const updated = await ProductService.getById(id)
    if (!updated) {
      throw new Error(`Product ${id} not found after update`)
    }
    return updated
  },

  delete: async (id: number) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `DELETE FROM PRODUCTS WHERE ID = :id`,
        { id },
        { autoCommit: true },
      )
      return (result.rowsAffected || 0) > 0
    } catch (err) {
      logger.error(`Error in ProductService.delete: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },
}

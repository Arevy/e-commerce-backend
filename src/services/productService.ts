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
    p.IMAGE_FILENAME,
    p.IMAGE_MIME_TYPE,
    p.IMAGE_UPDATED_AT,
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
  imageFilename: row[5],
  imageMimeType: row[6],
  imageUpdatedAt: row[7] instanceof Date ? row[7].toISOString() : row[7],
  category: row[8]
    ? {
        id: row[8],
        name: row[9],
        description: row[10],
      }
    : null,
})

export interface ProductImagePayload {
  filename: string
  mimeType: string
  data: Buffer
}

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
    image?: ProductImagePayload,
  ): Promise<Product> => {
    const connection = await getConnectionFromPool()
    try {
      const now = image ? new Date() : null
      const result = await connection.execute(
        `INSERT INTO PRODUCTS (
            NAME,
            PRICE,
            DESCRIPTION,
            CATEGORY_ID,
            IMAGE_FILENAME,
            IMAGE_MIME_TYPE,
            IMAGE_DATA,
            IMAGE_UPDATED_AT
         )
         VALUES (
            :name,
            :price,
            :description,
            :categoryId,
            :imageFilename,
            :imageMimeType,
            :imageData,
            :imageUpdatedAt
         )
         RETURNING ID INTO :id`,
        {
          name,
          price,
          description,
          categoryId,
          imageFilename: image?.filename ?? null,
          imageMimeType: image?.mimeType ?? null,
          imageData: image?.data ?? null,
          imageUpdatedAt: now,
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
    image?: ProductImagePayload | null,
    removeImage?: boolean,
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

      if (image) {
        fields.push('IMAGE_FILENAME = :imageFilename')
        fields.push('IMAGE_MIME_TYPE = :imageMimeType')
        fields.push('IMAGE_DATA = :imageData')
        fields.push('IMAGE_UPDATED_AT = :imageUpdatedAt')
        params.imageFilename = image.filename
        params.imageMimeType = image.mimeType
        params.imageData = image.data
        params.imageUpdatedAt = new Date()
      } else if (removeImage) {
        fields.push('IMAGE_FILENAME = NULL')
        fields.push('IMAGE_MIME_TYPE = NULL')
        fields.push('IMAGE_DATA = NULL')
        fields.push('IMAGE_UPDATED_AT = NULL')
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

  getImageContent: async (
    id: number,
  ): Promise<{ filename: string; mimeType: string; data: Buffer; updatedAt: Date } | null> => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `SELECT IMAGE_FILENAME, IMAGE_MIME_TYPE, IMAGE_DATA, IMAGE_UPDATED_AT
         FROM PRODUCTS
         WHERE ID = :id`,
        { id },
        { fetchInfo: { IMAGE_DATA: { type: oracledb.BUFFER } } },
      )

      const row = result.rows?.[0] as any[] | undefined
      if (!row || !row[0] || !row[1] || !row[2]) {
        return null
      }

      const filename = row[0] as string
      const mimeType = row[1] as string
      const data = row[2] as Buffer
      const updatedAtRaw = row[3] as Date | null | undefined

      if (!Buffer.isBuffer(data)) {
        return null
      }

      return {
        filename,
        mimeType,
        data,
        updatedAt: updatedAtRaw instanceof Date ? updatedAtRaw : new Date(),
      }
    } catch (err) {
      logger.error(`Error in ProductService.getImageContent: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },
}

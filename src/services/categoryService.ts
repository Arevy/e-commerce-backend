// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../config/database'
import { logger } from '../utils/logger'
import { Category } from '../models/category'

export const CategoryService = {
  getAll: async (
    limit?: number,
    offset?: number,
    name?: string,
  ): Promise<Category[]> => {
    const connection = await getConnectionFromPool()
    try {
      const params: Record<string, unknown> = {}
      const filters: string[] = []

      if (name) {
        filters.push('LOWER(NAME) LIKE :name')
        params.name = `%${name.toLowerCase()}%`
      }

      let query = `SELECT ID, NAME, DESCRIPTION FROM CATEGORIES`
      if (filters.length) {
        query += ` WHERE ${filters.join(' AND ')}`
      }
      query += ' ORDER BY ID'

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
      return (result.rows || []).map((row: any[]) => ({
        id: row[0],
        name: row[1],
        description: row[2],
      }))
    } catch (err) {
      logger.error(`Error in CategoryService.getAll: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },

  add: async (name: string, description?: string | null): Promise<Category> => {
    const connection = await getConnectionFromPool()
    try {
      const exists = await connection.execute(
        `SELECT ID FROM CATEGORIES WHERE LOWER(NAME) = :name`,
        { name: name.toLowerCase() },
      )
      if (exists.rows?.length) {
        throw new Error(`Category "${name}" already exists`)
      }

      const result = await connection.execute(
        `INSERT INTO CATEGORIES (NAME, DESCRIPTION)
         VALUES (:name, :description)
         RETURNING ID INTO :id`,
        {
          name,
          description,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )

      const id = (result.outBinds as any).id[0]
      return { id, name, description: description ?? undefined }
    } catch (err) {
      logger.error(`Error in CategoryService.add: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },

  update: async (
    id: number,
    name?: string,
    description?: string,
  ): Promise<Category> => {
    const connection = await getConnectionFromPool()
    try {
      const fields: string[] = []
      const params: Record<string, unknown> = { id }

      if (name !== undefined) {
        fields.push('NAME = :name')
        params.name = name
      }
      if (description !== undefined) {
        fields.push('DESCRIPTION = :description')
        params.description = description
      }

      if (!fields.length) {
        throw new Error('Nothing to update for category')
      }

      const result = await connection.execute(
        `UPDATE CATEGORIES SET ${fields.join(', ')} WHERE ID = :id`,
        params,
        { autoCommit: true },
      )

      if (!result.rowsAffected) {
        throw new Error(`Category ${id} not found`)
      }
    } catch (err) {
      logger.error(`Error in CategoryService.update: ${err}`)
      throw err
    } finally {
      await connection.close()
    }

    return CategoryService.getById(id)
  },

  delete: async (id: number) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `DELETE FROM CATEGORIES WHERE ID = :id`,
        { id },
        { autoCommit: true },
      )
      return (result.rowsAffected || 0) > 0
    } catch (err) {
      logger.error(`Error in CategoryService.delete: ${err}`)
      throw err
    } finally {
      await connection.close()
    }
  },

  getById: async (id: number): Promise<Category> => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `SELECT ID, NAME, DESCRIPTION FROM CATEGORIES WHERE ID = :id`,
        { id },
      )
      if (!result.rows?.length) {
        throw new Error(`Category ${id} not found`)
      }
      const row = result.rows[0] as any[]
      return {
        id: row[0],
        name: row[1],
        description: row[2],
      }
    } finally {
      await connection.close()
    }
  },
}

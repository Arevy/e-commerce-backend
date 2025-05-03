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
      let query = `SELECT ID, NAME, DESCRIPTION FROM CATEGORIES WHERE 1=1`
      const params: any = {}

      if (name) {
        query += ` AND NAME LIKE :name`
        params.name = `%${name}%`
      }
      if (offset) {
        query += ` OFFSET :offset ROWS`
        params.offset = offset
      }
      if (limit) {
        query += ` FETCH NEXT :limit ROWS ONLY`
        params.limit = limit
      }

      const result = await connection.execute(query, params)
      return result.rows.map((row: any[]) => ({
        id: row[0],
        name: row[1],
        description: row[2],
      }))
    } catch (err) {
      logger.error('Error in CategoryService.getAll:', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  add: async (name: string, description: string): Promise<Category> => {
    const connection = await getConnectionFromPool()
    try {
      // verificare unicitate
      const exists = await connection.execute(
        `SELECT ID FROM CATEGORIES WHERE NAME = :name`,
        { name },
      )
      if (exists.rows.length) {
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
      return { id: result.outBinds.id[0], name, description }
    } catch (err) {
      logger.error('Error in CategoryService.add:', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  update: async (id: number, name?: string, description?: string) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `UPDATE CATEGORIES SET
           NAME = COALESCE(:name, NAME),
           DESCRIPTION = COALESCE(:description, DESCRIPTION)
         WHERE ID = :id`,
        { id, name, description },
        { autoCommit: true },
      )
      if (result.rowsAffected === 0) {
        throw new Error(`Category ${id} not found`)
      }
      return { id, name, description }
    } catch (err) {
      logger.error('Error in CategoryService.update:', err)
      throw err
    } finally {
      await connection.close()
    }
  },

  delete: async (id: number) => {
    const connection = await getConnectionFromPool()
    try {
      const result = await connection.execute(
        `DELETE FROM CATEGORIES WHERE ID = :id`,
        { id },
        { autoCommit: true },
      )
      return result.rowsAffected > 0
    } catch (err) {
      logger.error('Error in CategoryService.delete:', err)
      throw err
    } finally {
      await connection.close()
    }
  },
}

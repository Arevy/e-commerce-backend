// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../../config/database'
import { logger } from '../../utils/logger'

export const categoryResolver = {
  Query: {
    getCategories: async (_: any, { limit, offset, name }: any) => {
      const connection = await getConnectionFromPool()
      try {
        let query = `SELECT ID, NAME, DESCRIPTION FROM CATEGORIES WHERE 1=1`
        const params: any = {}

        if (name) {
          query += ` AND NAME LIKE :name`
          params.name = `%${name}%`
        }
        if (limit) {
          query += ` FETCH NEXT :limit ROWS ONLY`
          params.limit = limit
        }
        if (offset) {
          query += ` OFFSET :offset ROWS`
          params.offset = offset
        }

        const result = await connection.execute(query, params)
        return result.rows.map((row: any[]) => ({
          id: row[0],
          name: row[1],
          description: row[2],
        }))
      } catch (err) {
        logger.error('Error in getCategories with filters:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
  },
  Mutation: {
    addCategory: async (_: any, { name, description }: any) => {
      const connection = await getConnectionFromPool()
      try {
        // Verifică dacă există deja o categorie cu același nume
        const existingCategory = await connection.execute(
          `SELECT ID FROM CATEGORIES WHERE NAME = :name`,
          { name },
        )

        if (existingCategory.rows.length > 0) {
          throw new Error(`Category with name "${name}" already exists`)
        }

        // Inserează categoria nouă
        const result = await connection.execute(
          `INSERT INTO CATEGORIES (NAME, DESCRIPTION) VALUES (:name, :description) RETURNING ID INTO :id`,
          {
            name,
            description,
            id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
          { autoCommit: true },
        )
        return { id: result.outBinds.id[0], name, description }
      } catch (err) {
        logger.error('Error in addCategory mutation:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
    updateCategory: async (_: any, { id, name, description }: any) => {
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
          throw new Error(`Category with ID ${id} not found`)
        }
        return { id, name, description }
      } catch (err) {
        logger.error('Error in updateCategory mutation:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
    deleteCategory: async (_: any, { id }: any) => {
      const connection = await getConnectionFromPool()
      try {
        const result = await connection.execute(
          `DELETE FROM CATEGORIES WHERE ID = :id`,
          { id },
          { autoCommit: true },
        )
        return result.rowsAffected > 0
      } catch (err) {
        logger.error('Error in deleteCategory mutation:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
  },
}

// @ts-ignore
import bcrypt from 'bcrypt'
// @ts-ignore
import oracledb from 'oracledb'
import jwt from 'jsonwebtoken'
import { getConnectionFromPool } from '../config/database'
import { logger } from '../utils/logger'
import { User, UserRole } from '../models/user'

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'

export const UserService = {
  getAll: async (filters?: {
    email?: string
    role?: UserRole
  }): Promise<User[]> => {
    const conn = await getConnectionFromPool()
    try {
      const where: string[] = []
      const params: Record<string, unknown> = {}

      if (filters?.email) {
        where.push('LOWER(EMAIL) LIKE :email')
        params.email = `%${filters.email.toLowerCase()}%`
      }
      if (filters?.role) {
        where.push('ROLE = :role')
        params.role = filters.role
      }

      const query =
        'SELECT ID, EMAIL, NAME, ROLE FROM USERS' +
        (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
        ' ORDER BY ID'

      try {
        const result = await conn.execute(query, params)
        return (result.rows || []).map((r: any[]) => ({
          id: r[0],
          email: r[1],
          name: r[2],
          role: r[3],
        }))
      } catch (err) {
        const missingRoleColumn =
          err instanceof Error &&
          err.message.includes('ORA-00904') &&
          err.message.toUpperCase().includes('ROLE')

        if (!missingRoleColumn) {
          throw err
        }

        logger.warn(
          'ROLE column not found in USERS table. Falling back to default role values.',
        )

        const fallbackWhere: string[] = []
        const fallbackParams: Record<string, unknown> = {}

        if (filters?.email) {
          fallbackWhere.push('LOWER(EMAIL) LIKE :email')
          fallbackParams.email = `%${filters.email.toLowerCase()}%`
        }

        if (filters?.role) {
          logger.warn('Ignoring role filter because USERS.ROLE column is missing.')
        }

        const fallbackQuery =
          'SELECT ID, EMAIL, NAME FROM USERS' +
          (fallbackWhere.length ? ` WHERE ${fallbackWhere.join(' AND ')}` : '') +
          ' ORDER BY ID'

        const fallbackResult = await conn.execute(fallbackQuery, fallbackParams)
        return (fallbackResult.rows || []).map((r: any[]) => ({
          id: r[0],
          email: r[1],
          name: r[2],
          role: 'CUSTOMER' as UserRole,
        }))
      }
    } finally {
      await conn.close()
    }
  },

  getById: async (id: number): Promise<User | null> => {
    const conn = await getConnectionFromPool()
    try {
      const result = await conn.execute(
        `SELECT ID, EMAIL, NAME, ROLE FROM USERS WHERE ID = :id`,
        { id },
      )
      if (!result.rows?.length) {
        return null
      }
      const row = result.rows[0] as any[]
      return {
        id: row[0],
        email: row[1],
        name: row[2],
        role: row[3],
      }
    } finally {
      await conn.close()
    }
  },

  register: async (email: string, password: string, name?: string) => {
    const conn = await getConnectionFromPool()
    try {
      // 1) check for duplicate
      const dup = await conn.execute(
        `SELECT 1 FROM USERS WHERE EMAIL = :email`,
        { email },
      )
      if (dup.rows.length) throw new Error('Email already registered')

      // 2) hash and insert
      const hash = await bcrypt.hash(password, 10)
      const result = await conn.execute(
        `INSERT INTO USERS (EMAIL, PASSWORD, NAME, ROLE)
         VALUES (:email, :hash, :name, 'CUSTOMER')
         RETURNING ID INTO :id`,
        {
          email,
          hash,
          name,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )
      const id = result.outBinds.id[0]
      return { id, email, name, role: 'CUSTOMER' as UserRole }
    } catch (err) {
      logger.error('Error in UserService.register:', err)
      throw err
    } finally {
      await conn.close()
    }
  },

  login: async (email: string, password: string) => {
    const conn = await getConnectionFromPool()
    try {
      const result = await conn.execute(
        `SELECT ID, PASSWORD, NAME, ROLE FROM USERS WHERE EMAIL = :email`,
        { email },
      )
      if (!result.rows.length) throw new Error('User not found')

      const [id, hash, name, role] = result.rows[0]
      const valid = await bcrypt.compare(password, hash)
      if (!valid) throw new Error('Invalid password')

      const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' })
      return { token, user: { id, email, name, role } }
    } catch (err) {
      logger.error('Error in UserService.login:', err)
      throw err
    } finally {
      await conn.close()
    }
  },

  create: async (
    email: string,
    password: string,
    name: string | undefined,
    role: UserRole,
  ): Promise<User> => {
    const conn = await getConnectionFromPool()
    try {
      const exists = await conn.execute(
        `SELECT 1 FROM USERS WHERE EMAIL = :email`,
        { email },
      )
      if (exists.rows?.length) {
        throw new Error('Email already registered')
      }

      const hash = await bcrypt.hash(password, 10)
      const result = await conn.execute(
        `INSERT INTO USERS (EMAIL, PASSWORD, NAME, ROLE)
         VALUES (:email, :hash, :name, :role)
         RETURNING ID INTO :id`,
        {
          email,
          hash,
          name,
          role,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true },
      )
      const id = (result.outBinds as any).id[0]
      return { id, email, name, role }
    } catch (err) {
      logger.error('Error in UserService.create:', err)
      throw err
    } finally {
      await conn.close()
    }
  },

  update: async (
    id: number,
    updates: {
      email?: string
      name?: string | null
      role?: UserRole
      password?: string
    },
  ): Promise<User> => {
    const conn = await getConnectionFromPool()
    try {
      const fields: string[] = []
      const params: Record<string, unknown> = { id }

      if (updates.email !== undefined) {
        fields.push('EMAIL = :email')
        params.email = updates.email
      }
      if (updates.name !== undefined) {
        fields.push('NAME = :name')
        params.name = updates.name
      }
      if (updates.role !== undefined) {
        fields.push('ROLE = :role')
        params.role = updates.role
      }
      if (updates.password !== undefined) {
        const hash = await bcrypt.hash(updates.password, 10)
        fields.push('PASSWORD = :password')
        params.password = hash
      }

      if (!fields.length) {
        throw new Error('Nothing to update for user')
      }

      const result = await conn.execute(
        `UPDATE USERS SET ${fields.join(', ')} WHERE ID = :id`,
        params,
        { autoCommit: true },
      )
      if (!result.rowsAffected) {
        throw new Error(`User ${id} not found`)
      }
    } catch (err) {
      logger.error('Error in UserService.update:', err)
      throw err
    } finally {
      await conn.close()
    }

    const updated = await UserService.getById(id)
    if (!updated) {
      throw new Error(`User ${id} not found after update`)
    }
    return updated
  },

  remove: async (id: number): Promise<boolean> => {
    const conn = await getConnectionFromPool()
    try {
      const result = await conn.execute(
        `DELETE FROM USERS WHERE ID = :id`,
        { id },
        { autoCommit: true },
      )
      return (result.rowsAffected || 0) > 0
    } catch (err) {
      logger.error('Error in UserService.remove:', err)
      throw err
    } finally {
      await conn.close()
    }
  },
}

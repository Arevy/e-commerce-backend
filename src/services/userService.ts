// @ts-ignore
import bcrypt from 'bcrypt'
// @ts-ignore
import oracledb from 'oracledb'
import jwt from 'jsonwebtoken'
import { getConnectionFromPool } from '../config/database'
import { logger } from '../utils/logger'

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'

export const UserService = {
  getAll: async () => {
    const conn = await getConnectionFromPool()
    try {
      const result = await conn.execute(`SELECT ID, EMAIL, NAME FROM USERS`)
      return result.rows.map((r: any[]) => ({
        id: r[0],
        email: r[1],
        name: r[2],
      }))
    } finally {
      await conn.close()
    }
  },

  register: async (email: string, password: string, name?: string) => {
    const conn = await getConnectionFromPool()
    try {
      // 1) verifică duplicat
      const dup = await conn.execute(
        `SELECT 1 FROM USERS WHERE EMAIL = :email`,
        { email },
      )
      if (dup.rows.length) throw new Error('Email already registered')

      // 2) hash și insert
      const hash = await bcrypt.hash(password, 10)
      const result = await conn.execute(
        `INSERT INTO USERS (EMAIL, PASSWORD, NAME)
         VALUES (:email, :hash, :name)
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
      return { id, email, name }
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
        `SELECT ID, PASSWORD, NAME FROM USERS WHERE EMAIL = :email`,
        { email },
      )
      if (!result.rows.length) throw new Error('User not found')

      const [id, hash, name] = result.rows[0]
      const valid = await bcrypt.compare(password, hash)
      if (!valid) throw new Error('Invalid password')

      const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' })
      return { token, user: { id, email, name } }
    } catch (err) {
      logger.error('Error in UserService.login:', err)
      throw err
    } finally {
      await conn.close()
    }
  },
}

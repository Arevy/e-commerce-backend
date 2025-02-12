// @ts-ignore
import bcrypt from 'bcrypt'
// @ts-ignore
import oracledb from 'oracledb'
import jwt from 'jsonwebtoken'
import { getConnectionFromPool } from '../../config/database'
import { logger } from '../../utils/logger'

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'

export const userResolver = {
  Query: {
    getUsers: async () => {
      const connection = await getConnectionFromPool()
      try {
        const result = await connection.execute(
          `SELECT ID, EMAIL, NAME FROM USERS`,
        )
        return result.rows.map((row: any[]) => ({
          id: row[0],
          email: row[1],
          name: row[2],
        }))
      } catch (err) {
        logger.error('Error fetching users:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
  },

  Mutation: {
    register: async (_: any, { email, password, name }: any) => {
      const connection = await getConnectionFromPool()
      logger.info(`Attempting to register user with email: ${email}`)

      try {
        const existingUser = await connection.execute(
          `SELECT ID FROM USERS WHERE EMAIL = :email`,
          { email },
        )
        logger.info(`Existing user check result:`, existingUser.rows)

        if (existingUser.rows.length > 0) {
          logger.warn(`Email already registered: ${email}`)
          throw new Error('Email already registered')
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        logger.info(`Password hashed successfully for ${email}`)

        const result = await connection.execute(
          `INSERT INTO USERS (EMAIL, PASSWORD, NAME) VALUES (:email, :password, :name) RETURNING ID INTO :id`,
          {
            email,
            password: hashedPassword,
            name,
            id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
          { autoCommit: true },
        )

        logger.info(`Insert result:`, result)

        if (result.outBinds && result.outBinds.id && result.outBinds.id[0]) {
          logger.info(
            `User registered successfully with ID: ${result.outBinds.id[0]}`,
          )
          return { id: result.outBinds.id[0], email, name }
        } else {
          logger.error('Insert succeeded but no ID returned.')
          throw new Error('Registration failed.')
        }
      } catch (err) {
        logger.error('Error registering user:', err)
        throw err
      } finally {
        await connection.close()
      }
    },

    login: async (_: any, { email, password }: any) => {
      const connection = await getConnectionFromPool()
      try {
        const result = await connection.execute(
          `SELECT ID, PASSWORD, NAME FROM USERS WHERE EMAIL = :email`,
          { email },
        )

        if (!result.rows.length) throw new Error('User not found')

        const [id, hashedPassword, name] = result.rows[0]
        const valid = await bcrypt.compare(password, hashedPassword)
        if (!valid) throw new Error('Invalid password')

        const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' })

        return {
          token,
          user: { id, email, name },
        }
      } catch (err) {
        logger.error('Error logging in:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
  },
}

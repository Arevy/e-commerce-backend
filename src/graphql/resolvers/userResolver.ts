// @ts-ignore
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../../config/database'

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'

export const userResolver = {
  Mutation: {
    register: async (_: any, { email, password, name }: any) => {
      const hashedPassword = await bcrypt.hash(password, 10)
      const connection = await getConnectionFromPool()
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
      await connection.close()
      return { id: result.outBinds.id[0], email, name }
    },
    login: async (_: any, { email, password }: any) => {
      const connection = await getConnectionFromPool()
      const result = await connection.execute(
        `SELECT ID, PASSWORD FROM USERS WHERE EMAIL = :email`,
        { email },
      )
      await connection.close()

      if (!result.rows.length) throw new Error('User not found')
      const [id, hashedPassword] = result.rows[0]
      const valid = await bcrypt.compare(password, hashedPassword)
      if (!valid) throw new Error('Invalid password')

      const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' })
      return { token }
    },
  },
}

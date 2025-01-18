// @ts-ignore
import oracledb from 'oracledb'
import { getConnectionFromPool } from '../../config/database'

export const categoryResolver = {
  Query: {
    getCategories: async () => {
      const connection = await getConnectionFromPool()
      try {
        // Obține toate categoriile
        const categoriesResult = await connection.execute(
          `SELECT ID, NAME, DESCRIPTION FROM CATEGORIES`,
        )
        const categories = categoriesResult.rows.map((row: any[]) => ({
          id: row[0],
          name: row[1],
          description: row[2],
          products: [],
        }))

        // Obține toate produsele asociate cu categoriile
        const productsResult = await connection.execute(
          `SELECT ID, NAME, PRICE, DESCRIPTION, CATEGORY_ID FROM PRODUCTS`,
        )
        const products = productsResult.rows.map((row: any[]) => ({
          id: row[0],
          name: row[1],
          price: row[2],
          description: row[3],
          categoryId: row[4],
        }))

        // Mapare: Adaugă produsele în categoriile corespunzătoare
        categories.forEach((category: { products: any; id: any }) => {
          category.products = products.filter(
            (product: { categoryId: any }) =>
              product.categoryId === category.id,
          )
        })

        return categories
      } catch (err) {
        console.error('Error in getCategories resolver:', err)
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
        console.error('Error in addCategory mutation:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
  },
}

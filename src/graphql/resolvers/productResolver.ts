import { getConnectionFromPool } from '../../config/database'
import { ProductService } from '../../services/productService'
import { Product } from '../../models/product'
import { validateInput } from '../../utils/validateInput'
import { logger } from '../../utils/logger'

export const productResolver = {
  Query: {
    getProducts: async (
      _: any,
      { limit, offset, name, categoryId }: any,
    ): Promise<Product[]> => {
      const connection = await getConnectionFromPool()
      try {
        let query = `SELECT ID, NAME, PRICE, DESCRIPTION, CATEGORY_ID FROM PRODUCTS WHERE 1=1`
        const params: any = {}

        if (name) {
          query += ` AND NAME LIKE :name`
          params.name = `%${name}%`
        }
        if (categoryId) {
          query += ` AND CATEGORY_ID = :categoryId`
          params.categoryId = categoryId
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
          price: row[2],
          description: row[3],
          categoryId: row[4],
        }))
      } catch (err) {
        logger.error('Error in getProducts with filters:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
    getProductById: async (_: any, { id }: any): Promise<Product | null> => {
      const connection = await getConnectionFromPool()
      try {
        const result = await connection.execute(
          `SELECT ID, NAME, PRICE, DESCRIPTION, CATEGORY_ID FROM PRODUCTS WHERE ID = :id`,
          { id },
        )
        if (result.rows.length === 0) {
          return null
        }
        const row = result.rows[0]
        return {
          id: row[0],
          name: row[1],
          price: row[2],
          description: row[3],
          categoryId: row[4],
        }
      } catch (err) {
        logger.error('Error in getProductById:', err)
        throw err
      } finally {
        await connection.close()
      }
    },
  },
  Mutation: {
    addProduct: async (_: any, args: any) => {
      const { name, price, description, categoryId } = args
      try {
        const connection = await getConnectionFromPool()

        // Verifică dacă categoria există
        const categoryCheck = await connection.execute(
          `SELECT ID, NAME FROM CATEGORIES WHERE ID = :id`,
          { id: categoryId },
        )
        const category = categoryCheck.rows.length
          ? {
              id: categoryCheck.rows[0][0],
              name: categoryCheck.rows[0][1],
            }
          : null

        if (!category) {
          throw new Error(`Category with ID ${categoryId} does not exist`)
        }

        const newProduct = await ProductService.add(
          name,
          price,
          description,
          categoryId,
        )
        logger.info('[GraphQL Mutation] Product added:', newProduct)

        return {
          ...newProduct,
          category,
        }
      } catch (err) {
        logger.error('Error in addProduct resolver:', err)
        throw err
      }
    },
    updateProduct: async (_: any, args: any) => {
      validateInput(args, {
        id: { required: true, type: 'number' },
        name: { required: false, type: 'string' },
        price: { required: false, type: 'number' },
        description: { required: false, type: 'string' },
      })
      return await ProductService.update(
        args.id,
        args.name,
        args.price,
        args.description,
      )
    },
    deleteProduct: async (_: any, args: any) =>
      await ProductService.delete(args.id),
    // updateProduct: async (_: any, args: any) => {
    //   const product = products.find((p) => p.id === args.id)
    //   if (!product) throw new Error('Product not found')
    //   Object.assign(product, args)
    //   return product
    // },
    // deleteProduct: async (_: any, { id }: any) => {
    //   const index = products.findIndex((p) => p.id === id)
    //   if (index === -1) throw new Error('Product not found')
    //   products.splice(index, 1)
    //   return true
    // },
  },
}

import {
  addProductToDB,
  deleteProductFromDB,
  getConnectionFromPool,
  getProductsFromDB,
  updateProductInDB,
} from '../../config/database'
import { ProductService } from '../../services/productService'
import { Product } from '../../models/product'
import { Category } from '../../models/category'
let products = [
  {
    id: '1',
    name: 'Laptop',
    price: 999.99,
    description: 'High-performance laptop',
  },
]

export const productResolver = {
  Query: {
    getProducts: async (): Promise<Product[]> => {
      try {
        const connection = await getConnectionFromPool()
        console.log('[GraphQL Query] getProducts called')

        // Obține produsele din baza de date
        const productsResult = await connection.execute(
          `SELECT ID, NAME, PRICE, DESCRIPTION, CATEGORY_ID FROM PRODUCTS`,
        )
        const products: Product[] = productsResult.rows.map((row: any[]) => ({
          id: row[0],
          name: row[1],
          price: row[2],
          description: row[3],
          categoryId: row[4],
        }))

        // Obține categoriile asociate
        const categoryIds = products
          .map((product) => product.categoryId)
          .filter(Boolean) as number[]
        const uniqueCategoryIds = [...new Set(categoryIds)]

        let categories: Category[] = []
        if (uniqueCategoryIds.length > 0) {
          const categoriesResult = await connection.execute(
            `SELECT ID, NAME FROM CATEGORIES WHERE ID IN (${uniqueCategoryIds.join(',')})`,
          )
          categories = categoriesResult.rows.map((row: any[]) => ({
            id: row[0],
            name: row[1],
          }))
        }

        // Mapare: Adaugă categoriile asociate fiecărui produs
        const productsWithCategories: Product[] = products.map((product) => ({
          ...product,
          category:
            categories.find((category) => category.id === product.categoryId) ||
            null,
        }))

        await connection.close()
        return productsWithCategories
      } catch (err) {
        console.error('Error in getProducts resolver:', err)
        throw err
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

        // Adaugă produsul în baza de date
        const newProduct = await ProductService.add(
          name,
          price,
          description,
          categoryId,
        )
        console.log('[GraphQL Mutation] Product added:', newProduct)

        // Adaugă categoria în obiectul returnat
        return {
          ...newProduct,
          category,
        }
      } catch (err) {
        console.error('Error in addProduct resolver:', err)
        throw err
      }
    },
    updateProduct: async (_: any, args: any) =>
      await ProductService.update(
        args.id,
        args.name,
        args.price,
        args.description,
      ),
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

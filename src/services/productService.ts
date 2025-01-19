import {
  getProductsFromDB,
  addProductToDB,
  updateProductInDB,
  deleteProductFromDB,
} from '../config/database'
import { logger } from '../utils/logger'

export const ProductService = {
  getAll: async () => await getProductsFromDB(),
  add: async (
    name: string,
    price: number,
    description: string,
    categoryId: number,
  ) => {
    try {
      logger.info('Adding product with categoryId:', categoryId)
      return await addProductToDB(name, price, description, categoryId)
    } catch (err) {
      logger.error('Error in ProductService.add:', err)
      throw err
    }
  },
  update: async (
    id: number,
    name?: string,
    price?: number,
    description?: string,
  ) => await updateProductInDB(id, name, price, description),
  delete: async (id: number) => await deleteProductFromDB(id),
}

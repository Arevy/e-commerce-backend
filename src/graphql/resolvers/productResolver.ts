import { ProductService } from '../../services/productService'
import { validateInput } from '../../utils/validateInput'
import { ProductFilterArgs } from '../types/args'

export const productResolver = {
  Query: {
    getProducts: (_: any, args: ProductFilterArgs) =>
      ProductService.getAll(args.limit, args.offset, args.name, args.categoryId),
    getProductById: (_: any, { id }: { id: string }) =>
      ProductService.getById(Number(id)),
  },

  Mutation: {
    addProduct: (_: any, args: { name: string; price: number; description?: string; categoryId: number }) => {
      validateInput(args, {
        name: { required: true, type: 'string' },
        price: { required: true, type: 'number' },
        categoryId: { required: true, type: 'number' },
      })
      return ProductService.add(args.name, args.price, args?.description!, args.categoryId)
    },

    updateProduct: (_: any, args: { id: string; name?: string; price?: number; description?: string }) => {
      validateInput(args, { id: { required: true, type: 'string' } })
      return ProductService.update(Number(args.id), args.name, args.price, args.description)
    },

    deleteProduct: (_: any, { id }: { id: string }) =>
      ProductService.delete(Number(id)),
  },
}
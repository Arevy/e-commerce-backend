import { ProductService } from '../../services/productService'
import { validateInput } from '../../utils/validateInput'
import { ProductFilterArgs } from '../types/args'

export const productResolver = {
  Query: {
    getProducts: (_: unknown, args: ProductFilterArgs) =>
      ProductService.getAll(
        args.limit,
        args.offset,
        args.name,
        args.categoryId ? Number(args.categoryId) : undefined,
      ),
    getProductById: (_: unknown, { id }: { id: string }) =>
      ProductService.getById(Number(id)),
  },

  Mutation: {
    addProduct: (
      _: unknown,
      args: {
        name: string
        price: number
        description?: string
        categoryId: string
      },
    ) => {
      validateInput(args, {
        name: { required: true, type: 'string' },
        price: { required: true, type: 'number' },
        categoryId: { required: true, type: 'string' },
      })

      return ProductService.add(
        args.name,
        args.price,
        args.description,
        Number(args.categoryId),
      )
    },

    updateProduct: (
      _: unknown,
      args: {
        id: string
        name?: string
        price?: number
        description?: string
        categoryId?: string
      },
    ) => {
      validateInput(args, { id: { required: true, type: 'string' } })
      return ProductService.update(
        Number(args.id),
        args.name,
        args.price,
        args.description,
        args.categoryId !== undefined ? Number(args.categoryId) : undefined,
      )
    },

    deleteProduct: (_: unknown, { id }: { id: string }) =>
      ProductService.delete(Number(id)),
  },
}

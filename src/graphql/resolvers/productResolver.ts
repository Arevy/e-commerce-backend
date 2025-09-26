import { ProductService } from '../../services/productService'
import { validateInput } from '../../utils/validateInput'
import { ProductFilterArgs } from '../types/args'
import type { GraphQLContext } from '../context'
import { buildImagePayload } from '../../utils/imageUpload'
import { resolveProductImage } from './shared/productImage'

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
        image?: {
          filename: string
          mimeType: string
          base64Data: string
        }
      },
    ) => {
      validateInput(args, {
        name: { required: true, type: 'string' },
        price: { required: true, type: 'number' },
        categoryId: { required: true, type: 'string' },
      })

      const imagePayload = buildImagePayload(args.image)

      return ProductService.add(
        args.name,
        args.price,
        args.description,
        Number(args.categoryId),
        imagePayload ?? undefined,
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
        image?: {
          filename: string
          mimeType: string
          base64Data: string
        }
        removeImage?: boolean
      },
    ) => {
      validateInput(args, { id: { required: true, type: 'string' } })

      if (args.image && args.removeImage) {
        throw new Error('Cannot upload a new image and remove the existing one in the same request.')
      }

      const imagePayload = buildImagePayload(args.image)

      return ProductService.update(
        Number(args.id),
        args.name,
        args.price,
        args.description,
        args.categoryId !== undefined ? Number(args.categoryId) : undefined,
        imagePayload,
        args.removeImage ? true : undefined,
      )
    },

    deleteProduct: (_: unknown, { id }: { id: string }) =>
      ProductService.delete(Number(id)),
  },

  Product: {
    image: (product: any, _: unknown, context: GraphQLContext) =>
      resolveProductImage(product, context),
  },
}

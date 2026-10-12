import { defaultFieldResolver, GraphQLSchema } from 'graphql'
import type { GraphQLContext } from './context'
import { ensureAuthenticated } from './utils/auth'
import { UserFacingError } from '../utils/graphqlErrorFormatter'

// Legacy top-level admin fields must have the same guard as customerSupport.*.
export function protectAdministrativeFields(schema: GraphQLSchema) {
  const fields = [
    [schema.getQueryType(), ['getUsers']],
    [schema.getMutationType(), [
      'addProduct', 'updateProduct', 'deleteProduct',
      'addCategory', 'updateCategory', 'deleteCategory',
      'createCmsPage', 'updateCmsPage', 'deleteCmsPage', 'publishCmsPage',
      'updateOrderStatus', 'deleteOrder', 'updatePaymentStatus', 'deletePayment',
    ]],
  ] as const
  for (const [type, names] of fields) {
    for (const name of names) {
      const field = type?.getFields()[name]
      if (!field) throw new Error(`Missing administrative field ${name}`)
      const resolve = field.resolve ?? defaultFieldResolver
      field.resolve = (source, args, context: GraphQLContext, info) => {
        if (ensureAuthenticated(context).role !== 'SUPPORT') {
          throw new UserFacingError('Support access required.', {code: 'FORBIDDEN'})
        }
        return resolve(source, args, context, info)
      }
    }
  }
}

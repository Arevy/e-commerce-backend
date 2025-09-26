import { OrderService } from '../../services/orderService'
import {
  CreateOrderArgs,
  UpdateOrderStatusArgs,
  DeleteOrderArgs,
} from '../types/args'
import type { GraphQLContext } from '../context'
import { ensureAuthenticated, ensureSessionMatchesUser } from '../utils/auth'

export const orderResolver = {
  Query: {
    getOrders: (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return OrderService.getByUser(numericId)
    },
  },

  Mutation: {
    createOrder: (_: unknown, args: CreateOrderArgs, context: GraphQLContext) => {
      const numericId = Number(args.userId)
      ensureSessionMatchesUser(context, numericId)
      return OrderService.create(
        numericId,
        args.products.map((item) => ({
          productId: Number(item.productId),
          quantity: item.quantity,
          price: item.price,
        })),
      )
    },

    updateOrderStatus: (_: unknown, args: UpdateOrderStatusArgs, context: GraphQLContext) => {
      ensureAuthenticated(context)
      return OrderService.updateStatus(Number(args.orderId), args.status)
    },

    deleteOrder: (_: unknown, args: DeleteOrderArgs, context: GraphQLContext) => {
      ensureAuthenticated(context)
      return OrderService.delete(Number(args.orderId))
    },
  },
}

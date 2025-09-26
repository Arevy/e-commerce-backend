import { CartService } from '../../services/cartService'
import type { GraphQLContext } from '../context'
import { ensureSessionMatchesUser } from '../utils/auth'

export const cartResolver = {
  Query: {
    getCart: (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return CartService.getCart(numericId)
    },
  },
  Mutation: {
    addToCart: (
      _: unknown,
      { userId, item }: { userId: string; item: { productId: string; quantity: number } },
      context: GraphQLContext,
    ) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return CartService.addToCart(
        numericId,
        Number(item.productId),
        item.quantity,
      )
    },
    removeFromCart: (
      _: unknown,
      { userId, productId }: { userId: string; productId: string },
      context: GraphQLContext,
    ) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return CartService.removeFromCart(numericId, Number(productId))
    },
    clearCart: (
      _: unknown,
      { userId }: { userId: string },
      context: GraphQLContext,
    ) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return CartService.clearCart(numericId)
    },
  },
}

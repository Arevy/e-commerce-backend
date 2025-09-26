import { WishlistService } from '../../services/wishlistService'
import type { GraphQLContext } from '../context'
import { ensureSessionMatchesUser } from '../utils/auth'

export const wishlistResolver = {
  Query: {
    getWishlist: (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return WishlistService.getWishlist(numericId)
    },
  },
  Mutation: {
    addToWishlist: (
      _: unknown,
      { userId, productId }: { userId: string; productId: string },
      context: GraphQLContext,
    ) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return WishlistService.addToWishlist(numericId, Number(productId))
    },
    removeFromWishlist: (
      _: unknown,
      { userId, productId }: { userId: string; productId: string },
      context: GraphQLContext,
    ) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return WishlistService.removeFromWishlist(numericId, Number(productId))
    },
  },
}

import { WishlistService } from '../../services/wishlistService'

export const wishlistResolver = {
  Query: {
    getWishlist: (_: unknown, { userId }: { userId: string }) =>
      WishlistService.getWishlist(Number(userId)),
  },
  Mutation: {
    addToWishlist: (_: unknown, { userId, productId }: any) =>
      WishlistService.addToWishlist(Number(userId), Number(productId)),
    removeFromWishlist: (_: unknown, { userId, productId }: any) =>
      WishlistService.removeFromWishlist(Number(userId), Number(productId)),
  },
}

import { CartService } from '../../services/cartService'

export const cartResolver = {
  Query: {
    getCart: (_: unknown, { userId }: { userId: string }) =>
      CartService.getCart(Number(userId)),
  },
  Mutation: {
    addToCart: (
      _: unknown,
      { userId, item }: { userId: string; item: { productId: string; quantity: number } },
    ) =>
      CartService.addToCart(
        Number(userId),
        Number(item.productId),
        item.quantity,
      ),
    removeFromCart: (_: unknown, { userId, productId }: any) =>
      CartService.removeFromCart(Number(userId), Number(productId)),
    clearCart: (_: unknown, { userId }: any) =>
      CartService.clearCart(Number(userId)),
  },
}

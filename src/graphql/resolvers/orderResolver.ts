import { OrderService } from '../../services/orderService'
import {
  CreateOrderArgs,
  UpdateOrderStatusArgs,
  DeleteOrderArgs,
} from '../types/args'

export const orderResolver = {
  Query: {
    getOrders: (_: unknown, { userId }: { userId: string }) =>
      OrderService.getByUser(Number(userId)),
  },

  Mutation: {
    createOrder: (_: unknown, args: CreateOrderArgs) =>
      OrderService.create(
        Number(args.userId),
        args.products.map((item) => ({
          productId: Number(item.productId),
          quantity: item.quantity,
          price: item.price,
        })),
      ),

    updateOrderStatus: (_: unknown, args: UpdateOrderStatusArgs) =>
      OrderService.updateStatus(Number(args.orderId), args.status),

    deleteOrder: (_: unknown, args: DeleteOrderArgs) =>
      OrderService.delete(Number(args.orderId)),
  },
}

import { OrderService } from '../../services/orderService'
import {
  CreateOrderArgs,
  UpdateOrderStatusArgs,
  DeleteOrderArgs,
} from '../types/args'

export const orderResolver = {
  Query: {
    getOrders: (_: any, { userId }: { userId: string }) =>
      OrderService.getByUser(Number(userId)),
  },

  Mutation: {
    createOrder: (_: any, args: CreateOrderArgs) =>
      OrderService.create(args.userId, args.products),

    updateOrderStatus: (_: any, args: UpdateOrderStatusArgs) =>
      OrderService.updateStatus(args.orderId, args.status),

    deleteOrder: (_: any, args: DeleteOrderArgs) =>
      OrderService.delete(args.orderId),
  },
}
import { OrderService } from '../../services/orderService'

export const orderResolver = {
  Query: {
    getOrders: async (_: any, { userId }: any) =>
      await OrderService.getOrders(userId),
  },
  Mutation: {
    createOrder: async (_: any, { userId, products }: any) =>
      await OrderService.createOrder(userId, products),

    updateOrderStatus: async (_: any, { orderId, status }: any) =>
      await OrderService.updateOrderStatus(orderId, status),

    deleteOrder: async (_: any, { orderId }: any) =>
      await OrderService.deleteOrder(orderId),
  },
}

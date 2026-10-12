import { PaymentService } from '../../services/paymentService'
import type { GraphQLContext } from '../context'
import { ensureAuthenticated, ensureSessionMatchesUser } from '../utils/auth'
import { OrderService } from '../../services/orderService'
import { UserFacingError } from '../../utils/graphqlErrorFormatter'

const ownedOrder = async (orderId: number, context: GraphQLContext) => {
  ensureAuthenticated(context)
  const order = await OrderService.getById(orderId)
  if (!order) throw new UserFacingError('Order not found.', {code: 'NOT_FOUND'})
  ensureSessionMatchesUser(context, order.userId)
  return order
}

export const paymentResolver = {
  Query: {
    getPayment: async (_: unknown, { paymentId }: { paymentId: string }, context: GraphQLContext) => {
      ensureAuthenticated(context)
      const payment = await PaymentService.getById(Number(paymentId))
      if (payment) await ownedOrder(payment.orderId, context)
      return payment
    },
  },
  Mutation: {
    createPayment: async (
      _: unknown,
      { orderId, amount, method }: any,
      context: GraphQLContext,
    ) => {
      const order = await ownedOrder(Number(orderId), context)
      if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(order.total * 100)) {
        throw new UserFacingError('Payment amount must match the order total.', {code: 'INVALID_AMOUNT'})
      }
      return PaymentService.create(order.id, order.total, method, true)
    },
    updatePaymentStatus: (
      _: unknown,
      { paymentId, status }: any,
      context: GraphQLContext,
    ) => {
      ensureAuthenticated(context)
      return PaymentService.updateStatus(Number(paymentId), status)
    },
    deletePayment: (
      _: unknown,
      { paymentId }: any,
      context: GraphQLContext,
    ) => {
      ensureAuthenticated(context)
      return PaymentService.remove(Number(paymentId))
    },
  },
}

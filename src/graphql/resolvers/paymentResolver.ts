import { PaymentService } from '../../services/paymentService'
import type { GraphQLContext } from '../context'
import { ensureAuthenticated } from '../utils/auth'

export const paymentResolver = {
  Query: {
    getPayment: (_: unknown, { paymentId }: { paymentId: string }, context: GraphQLContext) => {
      ensureAuthenticated(context)
      return PaymentService.getById(Number(paymentId))
    },
  },
  Mutation: {
    createPayment: (
      _: unknown,
      { orderId, amount, method }: any,
      context: GraphQLContext,
    ) => {
      ensureAuthenticated(context)
      return PaymentService.create(Number(orderId), amount, method)
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

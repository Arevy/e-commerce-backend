import { PaymentService } from '../../services/paymentService'

export const paymentResolver = {
  Query: {
    getPayment: (_: unknown, { paymentId }: { paymentId: string }) =>
      PaymentService.getById(Number(paymentId)),
  },
  Mutation: {
    createPayment: (_: unknown, { orderId, amount, method }: any) =>
      PaymentService.create(Number(orderId), amount, method),
    updatePaymentStatus: (_: unknown, { paymentId, status }: any) =>
      PaymentService.updateStatus(Number(paymentId), status),
    deletePayment: (_: unknown, { paymentId }: any) =>
      PaymentService.remove(Number(paymentId)),
  },
}

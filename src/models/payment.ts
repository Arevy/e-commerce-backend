export interface Payment {
  id: number
  orderId: number
  amount: number
  method: string
  status: string
  createdAt: string
}

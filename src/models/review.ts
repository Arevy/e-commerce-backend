export interface Review {
  id: number
  productId: number
  userId: number
  rating: number
  reviewText?: string | null
  createdAt: string
}

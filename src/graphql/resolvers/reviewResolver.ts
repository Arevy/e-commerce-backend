import { ReviewService } from '../../services/reviewService'

export const reviewResolver = {
  Query: {
    getReviews: (_: unknown, { productId }: { productId: string }) =>
      ReviewService.getByProduct(Number(productId)),
  },
  Mutation: {
    addReview: (
      _: unknown,
      {
        productId,
        userId,
        rating,
        reviewText,
      }: { productId: string; userId: string; rating: number; reviewText?: string },
    ) =>
      ReviewService.add(
        Number(productId),
        Number(userId),
        rating,
        reviewText,
      ),

    updateReview: (
      _: unknown,
      {
        reviewId,
        rating,
        reviewText,
      }: { reviewId: string; rating?: number; reviewText?: string },
    ) => ReviewService.update(Number(reviewId), rating, reviewText),

    deleteReview: (_: unknown, { reviewId }: { reviewId: string }) =>
      ReviewService.delete(Number(reviewId)),
  },
}

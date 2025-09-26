import { getConnectionFromPool } from '../config/database'
import { cacheDel, cacheGet, cacheSet } from '../config/redis'
import { Wishlist } from '../models/wishlist'
import { logger } from '../utils/logger'
import { invalidateUserContextCache } from './userContextCache'

const wishlistCacheKey = (userId: number) => `wishlist:${userId}`

const mapWishlistProduct = (row: any[]) => ({
  id: row[0],
  name: row[1],
  price: row[2],
  description: row[3],
  categoryId: row[4],
})

export const WishlistService = {
  getWishlist: async (userId: number): Promise<Wishlist> => {
    logger.debug('WishlistService.getWishlist called', { userId })
    const cached = await cacheGet<Wishlist>(wishlistCacheKey(userId))
    if (cached) {
      return cached
    }

    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `SELECT p.ID,
                p.NAME,
                p.PRICE,
                p.DESCRIPTION,
                p.CATEGORY_ID
           FROM WISHLIST w
           JOIN PRODUCTS p ON p.ID = w.PRODUCT_ID
          WHERE w.USER_ID = :userId`,
        { userId },
      )

      const products = (res.rows || []).map((row: any[]) =>
        mapWishlistProduct(row),
      )
      const wishlist: Wishlist = { userId, products }
      await cacheSet(wishlistCacheKey(userId), wishlist, 120)
      return wishlist
    } finally {
      await conn.close()
    }
  },

  addToWishlist: async (
    userId: number,
    productId: number,
  ): Promise<Wishlist> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `INSERT INTO WISHLIST (USER_ID, PRODUCT_ID)
         VALUES (:userId, :productId)`,
        { userId, productId },
        { autoCommit: true },
      )
    } catch (error: any) {
      if (error?.errorNum === 1) {
        // ORA-00001 unique constraint violation - ignore duplicates
      } else {
        throw error
      }
    } finally {
      await conn.close()
    }

    await cacheDel(wishlistCacheKey(userId))
    await invalidateUserContextCache(userId)
    return WishlistService.getWishlist(userId)
  },

  removeFromWishlist: async (
    userId: number,
    productId: number,
  ): Promise<Wishlist> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `DELETE FROM WISHLIST WHERE USER_ID = :userId AND PRODUCT_ID = :productId`,
        { userId, productId },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(wishlistCacheKey(userId))
    await invalidateUserContextCache(userId)
    return WishlistService.getWishlist(userId)
  },
}

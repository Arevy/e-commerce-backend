import { getConnectionFromPool } from '../config/database'
import { cacheDel, cacheGet, cacheSet } from '../config/redis'
import { Cart, CartItem } from '../models/cart'
import { logger } from '../utils/logger'
import { invalidateUserContextCache } from './userContextCache'

const cartCacheKey = (userId: number) => `cart:${userId}`

const mapCartItemRow = (row: any[]): CartItem => ({
  product: {
    id: row[0],
    name: row[2],
    price: row[3],
    description: row[4],
    categoryId: row[5],
    imageFilename: row[6],
    imageMimeType: row[7],
    imageUpdatedAt: row[8] instanceof Date ? row[8].toISOString() : row[8],
  },
  quantity: row[1],
})

const buildCartResponse = (userId: number, rows: any[]): Cart => {
  const items = rows.map((row) => mapCartItemRow(row))
  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.product.price,
    0,
  )
  return { userId, items, total }
}

export const CartService = {
  getCart: async (userId: number): Promise<Cart> => {
    logger.debug('CartService.getCart called', { userId })
    const cached = await cacheGet<Cart>(cartCacheKey(userId))
    if (cached) {
      return cached
    }

    const conn = await getConnectionFromPool()
    try {
      const res = await conn.execute(
        `SELECT ci.PRODUCT_ID,
                ci.QUANTITY,
                p.NAME,
                p.PRICE,
                p.DESCRIPTION,
                p.CATEGORY_ID,
                p.IMAGE_FILENAME,
                p.IMAGE_MIME_TYPE,
                p.IMAGE_UPDATED_AT
           FROM CART_ITEMS ci
           JOIN PRODUCTS p ON p.ID = ci.PRODUCT_ID
          WHERE ci.USER_ID = :userId`,
        { userId },
      )

      const cart = buildCartResponse(
        userId,
        (res.rows || []) as any[],
      )
      await cacheSet(cartCacheKey(userId), cart, 60)
      return cart
    } finally {
      await conn.close()
    }
  },

  addToCart: async (
    userId: number,
    productId: number,
    quantity: number,
  ): Promise<Cart> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `MERGE INTO CART_ITEMS c USING DUAL
           ON (c.USER_ID = :userId AND c.PRODUCT_ID = :productId)
         WHEN MATCHED THEN
           UPDATE SET c.QUANTITY = c.QUANTITY + :quantity
         WHEN NOT MATCHED THEN
           INSERT (USER_ID, PRODUCT_ID, QUANTITY) VALUES (:userId, :productId, :quantity)`,
        { userId, productId, quantity },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(cartCacheKey(userId))
    await invalidateUserContextCache(userId)
    return CartService.getCart(userId)
  },

  removeFromCart: async (userId: number, productId: number): Promise<Cart> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `DELETE FROM CART_ITEMS WHERE USER_ID = :userId AND PRODUCT_ID = :productId`,
        { userId, productId },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(cartCacheKey(userId))
    await invalidateUserContextCache(userId)
    return CartService.getCart(userId)
  },

  clearCart: async (userId: number): Promise<boolean> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `DELETE FROM CART_ITEMS WHERE USER_ID = :userId`,
        { userId },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(cartCacheKey(userId))
    await invalidateUserContextCache(userId)
    return true
  },
}

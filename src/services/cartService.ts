import { getConnectionFromPool } from '../config/database'
import { cacheDel, cacheGet, cacheSet } from '../config/redis'
import { Cart, CartItem } from '../models/cart'

const cartCacheKey = (userId: number) => `cart:${userId}`

const mapCartItemRow = (row: any[]): CartItem => ({
  product: {
    id: row[0],
    name: row[2],
    price: row[3],
    description: row[4],
    categoryId: row[5],
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
                p.CATEGORY_ID
           FROM CART_ITEMS ci
           JOIN PRODUCTS p ON p.ID = ci.PRODUCT_ID
          WHERE ci.USER_ID = :uid`,
        { uid: userId },
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
           ON (c.USER_ID=:uid AND c.PRODUCT_ID=:pid)
         WHEN MATCHED THEN
           UPDATE SET c.QUANTITY = c.QUANTITY + :qty
         WHEN NOT MATCHED THEN
           INSERT (USER_ID, PRODUCT_ID, QUANTITY) VALUES (:uid,:pid,:qty)`,
        { uid: userId, pid: productId, qty: quantity },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(cartCacheKey(userId))
    return CartService.getCart(userId)
  },

  removeFromCart: async (userId: number, productId: number): Promise<Cart> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `DELETE FROM CART_ITEMS WHERE USER_ID=:uid AND PRODUCT_ID=:pid`,
        { uid: userId, pid: productId },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(cartCacheKey(userId))
    return CartService.getCart(userId)
  },

  clearCart: async (userId: number): Promise<boolean> => {
    const conn = await getConnectionFromPool()
    try {
      await conn.execute(
        `DELETE FROM CART_ITEMS WHERE USER_ID=:uid`,
        { uid: userId },
        { autoCommit: true },
      )
    } finally {
      await conn.close()
    }

    await cacheDel(cartCacheKey(userId))
    return true
  },
}

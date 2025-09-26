import { AddressService } from './addressService'
import { CartService } from './cartService'
import { WishlistService } from './wishlistService'
import { UserService } from './userService'
import type { UserContext } from '../models/userContext'
import {
  getCachedUserContext,
  setCachedUserContext,
  invalidateUserContextCache,
} from './userContextCache'
import { logger } from '../utils/logger'

const ensurePositiveUserId = (userId: number) => {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('A valid user id is required to load the user context.')
  }
}

export const UserContextService = {
  getContext: async (userId: number): Promise<UserContext> => {
    ensurePositiveUserId(userId)

    const cached = await getCachedUserContext(userId)
    if (cached) {
      return cached
    }

    const user = await UserService.getById(userId)
    if (!user) {
      throw new Error(`User ${userId} not found`)
    }

    const [cart, wishlist, addresses] = await Promise.all([
      CartService.getCart(userId),
      WishlistService.getWishlist(userId),
      AddressService.getByUser(userId),
    ])

    const context: UserContext = {
      user,
      cart,
      wishlist,
      addresses,
    }

    await setCachedUserContext(userId, context)
    return context
  },

  refreshContext: async (userId: number): Promise<UserContext> => {
    ensurePositiveUserId(userId)
    await invalidateUserContextCache(userId)
    try {
      return await UserContextService.getContext(userId)
    } catch (error) {
      logger.error(`Failed to refresh user context for ${userId}: ${error}`)
      throw error
    }
  },

  invalidateContext: async (userId: number) => {
    ensurePositiveUserId(userId)
    await invalidateUserContextCache(userId)
  },
}

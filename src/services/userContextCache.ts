import { cacheDel, cacheGet, cacheSet } from '../config/redis'
import type { UserContext } from '../models/userContext'

const userContextCacheKey = (userId: number) => `user-context:${userId}`

export const getCachedUserContext = async (
  userId: number,
): Promise<UserContext | null> => cacheGet<UserContext>(userContextCacheKey(userId))

export const setCachedUserContext = async (
  userId: number,
  context: UserContext,
) => cacheSet(userContextCacheKey(userId), context, 120)

export const invalidateUserContextCache = async (userId: number) =>
  cacheDel(userContextCacheKey(userId))

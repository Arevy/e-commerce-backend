import crypto from 'crypto'
import type { Response } from 'express'
import { cacheDel, cacheGet, cacheSet } from '../config/redis'
import { logger } from '../utils/logger'
import type { UserRole } from '../models/user'

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7) // 7 days
const IMPERSONATION_TTL_SECONDS = Number(process.env.IMPERSONATION_TTL_SECONDS || 60)

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid'
export const SUPPORT_SESSION_COOKIE_NAME = process.env.SUPPORT_SESSION_COOKIE_NAME || 'support_sid'

export interface SessionRecord {
  id: string
  userId: number
  email: string
  name?: string | null
  role: UserRole
  impersonatedBy?: number | null
  createdAt: string
}

interface ImpersonationRecord {
  userId: number
  adminId: number
  createdAt: string
}

const sessionKey = (sessionId: string) => `session:${sessionId}`
const userSessionsKey = (userId: number) => `session-user:${userId}`
const impersonationKey = (token: string) => `impersonate:${token}`

const setCookieHeader = (res: Response, value: string) => {
  const existing = res.getHeader('Set-Cookie')

  if (!existing) {
    res.setHeader('Set-Cookie', value)
    return
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, value])
    return
  }

  res.setHeader('Set-Cookie', [existing as string, value])
}

const buildSessionCookie = (sessionId: string, cookieName: string) => {
  const isProduction = process.env.NODE_ENV === 'production'
  const maxAge = SESSION_TTL_SECONDS
  const cookieParts = [
    `${cookieName}=${sessionId}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (isProduction) {
    cookieParts.push('Secure')
  }

  return cookieParts.join('; ')
}

const buildExpiredCookie = (cookieName: string) => {
  const isProduction = process.env.NODE_ENV === 'production'
  const parts = [`${cookieName}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (isProduction) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

const touchUserSessionsBucket = async (userId: number, sessionIds: string[]) => {
  if (sessionIds.length) {
    await cacheSet(userSessionsKey(userId), sessionIds, SESSION_TTL_SECONDS)
  } else {
    await cacheDel(userSessionsKey(userId))
  }
}

export const SessionService = {
  async createSession(params: {
    userId: number
    email: string
    name?: string | null
    role: UserRole
    impersonatedBy?: number | null
  }): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      userId: params.userId,
      email: params.email,
      name: params.name,
      role: params.role,
      impersonatedBy: params.impersonatedBy ?? null,
      createdAt: new Date().toISOString(),
    }

    await cacheSet(sessionKey(session.id), session, SESSION_TTL_SECONDS)

    const existing = (await cacheGet<string[]>(userSessionsKey(session.userId))) ?? []
    if (!existing.includes(session.id)) {
      existing.push(session.id)
    }
    await touchUserSessionsBucket(session.userId, existing)

    return session
  },

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const session = await cacheGet<SessionRecord>(sessionKey(sessionId))
    if (!session) {
      return null
    }

    // Refresh TTL for active sessions
    await cacheSet(sessionKey(sessionId), session, SESSION_TTL_SECONDS)
    const currentSessions =
      (await cacheGet<string[]>(userSessionsKey(session.userId))) ?? []
    if (currentSessions.length) {
      await touchUserSessionsBucket(session.userId, currentSessions)
    }

    return session
  },

  async invalidateSession(sessionId: string): Promise<boolean> {
    const session = await cacheGet<SessionRecord>(sessionKey(sessionId))
    if (!session) {
      return false
    }

    await cacheDel(sessionKey(sessionId))

    const existing = (await cacheGet<string[]>(userSessionsKey(session.userId))) ?? []
    const filtered = existing.filter((id) => id !== sessionId)
    await touchUserSessionsBucket(session.userId, filtered)

    return true
  },

  async invalidateSessionsForUser(userId: number): Promise<number> {
    const existing = (await cacheGet<string[]>(userSessionsKey(userId))) ?? []
    if (!existing.length) {
      return 0
    }

    await Promise.all(existing.map((sessionId) => cacheDel(sessionKey(sessionId))))
    await cacheDel(userSessionsKey(userId))
    return existing.length
  },

  attachSessionCookie(res: Response, session: SessionRecord, cookieName?: string) {
    const targetCookie = cookieName || (session.role === 'SUPPORT' ? SUPPORT_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME)
    setCookieHeader(res, buildSessionCookie(session.id, targetCookie))
  },

  clearSessionCookie(res: Response, role?: UserRole) {
    if (role) {
      const targetCookie = role === 'SUPPORT' ? SUPPORT_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME
      setCookieHeader(res, buildExpiredCookie(targetCookie))
      return
    }

    setCookieHeader(res, buildExpiredCookie(SESSION_COOKIE_NAME))
    if (SUPPORT_SESSION_COOKIE_NAME !== SESSION_COOKIE_NAME) {
      setCookieHeader(res, buildExpiredCookie(SUPPORT_SESSION_COOKIE_NAME))
    }
  },

  async createImpersonationTicket(adminSession: SessionRecord, userId: number) {
    const token = crypto.randomUUID()
    const record: ImpersonationRecord = {
      userId,
      adminId: adminSession.userId,
      createdAt: new Date().toISOString(),
    }

    await cacheSet(impersonationKey(token), record, IMPERSONATION_TTL_SECONDS)

    return {
      token,
      expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(),
    }
  },

  async redeemImpersonationTicket(token: string): Promise<ImpersonationRecord | null> {
    const record = await cacheGet<ImpersonationRecord>(impersonationKey(token))
    if (!record) {
      return null
    }

    await cacheDel(impersonationKey(token))
    return record
  },
}

export const parseSessionCookie = (cookieHeader?: string, preferSupport = false): string | null => {
  if (!cookieHeader) {
    return null
  }

  let supportSession: string | null = null
  let defaultSession: string | null = null

  const parts = cookieHeader.split(';')
  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part) continue
    const [key, ...rest] = part.split('=')
    if (key === SUPPORT_SESSION_COOKIE_NAME) {
      supportSession = rest.join('=') || null
    } else if (key === SESSION_COOKIE_NAME) {
      defaultSession = rest.join('=') || null
    }
  }

  if (preferSupport && supportSession) {
    return supportSession
  }

  return defaultSession ?? supportSession
}

export const ensureArray = <T>(input: T | T[]): T[] => (Array.isArray(input) ? input : [input])

export const appendCookie = (res: Response, cookies: string | string[]) => {
  ensureArray(cookies).forEach((cookie) => setCookieHeader(res, cookie))
}

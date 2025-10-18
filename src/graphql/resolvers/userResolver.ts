import { UserService } from '../../services/userService'
import { SessionService } from '../../services/sessionService'
import { UserContextService } from '../../services/userContextService'
import type { GraphQLContext } from '../context'
import { RegisterArgs, LoginArgs, UpdateUserProfileArgs } from '../types/args'
import { UserFacingError } from '../../utils/graphqlErrorFormatter'
import { ensureAuthenticated } from '../utils/auth'

export const userResolver = {
  Query: {
    getUsers: () => UserService.getAll(),
  },

  Mutation: {
    register: (_: any, args: RegisterArgs) =>
      UserService.register(args.email, args.password, args.name),

    login: async (_: unknown, args: LoginArgs, context: GraphQLContext) => {
      const result = await UserService.login(args.email, args.password)

      const session = await SessionService.createSession({
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      })

      SessionService.attachSessionCookie(context.res, session)

      return result
    },

    logout: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (context.session) {
        await UserContextService.invalidateContext(context.session.userId)
        await SessionService.invalidateSession(context.session.id)
      }
      SessionService.clearSessionCookie(context.res, context.session?.role)
      return true
    },

    redeemImpersonation: async (
      _: unknown,
      { token }: { token: string },
      context: GraphQLContext,
    ) => {
      const impersonation = await SessionService.redeemImpersonationTicket(token)
      if (!impersonation) {
        throw new UserFacingError('Impersonation token is invalid or has expired.', {
          code: 'IMPERSONATION_INVALID',
        })
      }

      const user = await UserService.getById(impersonation.userId)
      if (!user) {
        throw new UserFacingError('Unable to impersonate the requested user.', {
          code: 'IMPERSONATION_MISSING_TARGET',
        })
      }

      const session = await SessionService.createSession({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        impersonatedBy: impersonation.adminId,
      })

      SessionService.attachSessionCookie(context.res, session)

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    },

    updateUserProfile: async (
      _: unknown,
      { input }: UpdateUserProfileArgs,
      context: GraphQLContext,
    ) => {
      const session = ensureAuthenticated(context)

      const updates: {
        name?: string | null
        email?: string
      } = {}

      if (Object.prototype.hasOwnProperty.call(input, 'name')) {
        const name = input.name ?? ''
        const trimmed = name.trim()
        updates.name = trimmed.length ? trimmed : null
      }

      if (Object.prototype.hasOwnProperty.call(input, 'email')) {
        if (typeof input.email !== 'string') {
          throw new UserFacingError('Email address is required.', {
            code: 'INVALID_EMAIL',
          })
        }
        const email = input.email.trim()
        if (!email) {
          throw new UserFacingError('Email address is required.', {
            code: 'INVALID_EMAIL',
          })
        }
        updates.email = email
      }

      if (!Object.keys(updates).length) {
        const existing = await UserService.getById(session.userId)
        if (!existing) {
          throw new UserFacingError('User not found.', { code: 'USER_NOT_FOUND' })
        }
        return {
          user: existing,
          message: 'No changes detected.',
        }
      }

      const currentPassword = input.currentPassword?.trim() ?? ''
      if (!currentPassword) {
        throw new UserFacingError('Password confirmation is required to update your profile.', {
          code: 'PASSWORD_REQUIRED',
        })
      }

      const passwordMatches = await UserService.verifyPassword(session.userId, currentPassword)
      if (!passwordMatches) {
        throw new UserFacingError('Current password is incorrect.', {
          code: 'INVALID_CREDENTIALS',
        })
      }

      const updated = await UserService.update(session.userId, updates)

      await SessionService.updateSessionMetadata(session.id, {
        email: updated.email,
        name: updated.name,
      })

      if (context.session) {
        context.session.email = updated.email
        context.session.name = updated.name
      }

      return {
        user: updated,
        message: 'Profile updated successfully.',
      }
    },

    changeUserPassword: async (
      _: unknown,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      context: GraphQLContext,
    ) => {
      const session = ensureAuthenticated(context)

      if (!newPassword || newPassword.length < 8) {
        throw new UserFacingError('New password must be at least 8 characters long.', {
          code: 'PASSWORD_TOO_SHORT',
        })
      }

      await UserService.changePassword(session.userId, currentPassword, newPassword)

      await SessionService.updateSessionMetadata(session.id, {
        email: session.email,
        name: session.name,
      })

      return true
    },
  },
}

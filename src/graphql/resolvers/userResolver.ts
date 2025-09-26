import { UserService } from '../../services/userService'
import { SessionService } from '../../services/sessionService'
import { UserContextService } from '../../services/userContextService'
import type { GraphQLContext } from '../context'
import { RegisterArgs, LoginArgs } from '../types/args'

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
        throw new Error('Impersonation token is invalid or has expired.')
      }

      const user = await UserService.getById(impersonation.userId)
      if (!user) {
        throw new Error('Unable to impersonate missing user.')
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
  },
}

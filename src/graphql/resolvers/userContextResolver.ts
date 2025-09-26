import { UserContextService } from '../../services/userContextService'
import type { GraphQLContext } from '../context'
import { ensureSessionMatchesUser } from '../utils/auth'

export const userContextResolver = {
  Query: {
    getUserContext: (
      _: unknown,
      { userId }: { userId: string },
      context: GraphQLContext,
    ) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return UserContextService.getContext(numericId)
    },
  },
}

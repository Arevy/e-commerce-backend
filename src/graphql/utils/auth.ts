import type { GraphQLContext } from '../context'
import { UserFacingError } from '../../utils/graphqlErrorFormatter'

export const ensureAuthenticated = (context: GraphQLContext) => {
  if (!context.session) {
    throw new UserFacingError('Authentication required.', { code: 'UNAUTHENTICATED' })
  }
  return context.session
}

export const ensureSessionMatchesUser = (
  context: GraphQLContext,
  userId: number,
) => {
  const session = ensureAuthenticated(context)
  if (session.userId !== userId) {
    throw new UserFacingError('You are not authorized to perform this action.', { code: 'FORBIDDEN' })
  }
  return session
}

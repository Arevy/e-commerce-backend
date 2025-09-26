import type { GraphQLContext } from '../context'

export const ensureAuthenticated = (context: GraphQLContext) => {
  if (!context.session) {
    throw new Error('Authentication required.')
  }
  return context.session
}

export const ensureSessionMatchesUser = (
  context: GraphQLContext,
  userId: number,
) => {
  const session = ensureAuthenticated(context)
  if (session.userId !== userId) {
    throw new Error('You are not authorized to perform this action.')
  }
  return session
}

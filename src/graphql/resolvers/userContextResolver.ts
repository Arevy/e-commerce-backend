import { UserContextService } from '../../services/userContextService'

export const userContextResolver = {
  Query: {
    getUserContext: (_: unknown, { userId }: { userId: string }) =>
      UserContextService.getContext(Number(userId)),
  },
}

import { AddressService } from '../../services/addressService'
import type { GraphQLContext } from '../context'
import { ensureAuthenticated, ensureSessionMatchesUser } from '../utils/auth'

export const addressResolver = {
  Query: {
    getAddresses: (_: unknown, { userId }: { userId: string }, context: GraphQLContext) => {
      const numericId = Number(userId)
      ensureSessionMatchesUser(context, numericId)
      return AddressService.getByUser(numericId)
    },
  },
  Mutation: {
    addAddress: (_: unknown, args: any, context: GraphQLContext) => {
      const numericId = Number(args.userId)
      ensureSessionMatchesUser(context, numericId)
      return AddressService.add(
        numericId,
        args.street,
        args.city,
        args.postalCode,
        args.country,
      )
    },
    updateAddress: async (_: unknown, args: any, context: GraphQLContext) => {
      const addressId = Number(args.addressId)
      const existing = await AddressService.getById(addressId)
      if (!existing) {
        throw new Error(`Address ${addressId} not found`)
      }
      ensureSessionMatchesUser(context, existing.userId)
      return AddressService.update(
        addressId,
        args.street,
        args.city,
        args.postalCode,
        args.country,
      )
    },
    deleteAddress: async (
      _: unknown,
      { addressId }: { addressId: string },
      context: GraphQLContext,
    ) => {
      const address = await AddressService.getById(Number(addressId))
      if (address) {
        ensureSessionMatchesUser(context, address.userId)
      } else {
        ensureAuthenticated(context)
      }
      return AddressService.delete(Number(addressId))
    },
  },
}

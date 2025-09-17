import { AddressService } from '../../services/addressService'

export const addressResolver = {
  Query: {
    getAddresses: (_: unknown, { userId }: { userId: string }) =>
      AddressService.getByUser(Number(userId)),
  },
  Mutation: {
    addAddress: (_: unknown, args: any) =>
      AddressService.add(
        Number(args.userId),
        args.street,
        args.city,
        args.postalCode,
        args.country,
      ),
    updateAddress: (_: unknown, args: any) =>
      AddressService.update(
        Number(args.addressId),
        args.street,
        args.city,
        args.postalCode,
        args.country,
      ),
    deleteAddress: (_: unknown, { addressId }: { addressId: string }) =>
      AddressService.delete(Number(addressId)),
  },
}

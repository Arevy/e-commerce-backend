import type { Address } from './address'
import type { Cart } from './cart'
import type { User } from './user'
import type { Wishlist } from './wishlist'

export interface UserContext {
  user: User
  cart: Cart
  wishlist: Wishlist
  addresses: Address[]
}

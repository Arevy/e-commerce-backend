import { Product } from './product'

export interface CartItem {
  product: Pick<Product, 'id' | 'name' | 'price' | 'description' | 'categoryId'>
  quantity: number
}

export interface Cart {
  userId: number
  items: CartItem[]
  total: number
}

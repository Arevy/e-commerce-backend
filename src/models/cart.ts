import { Product } from './product'

export interface CartItem {
  product: Pick<
    Product,
    'id' | 'name' | 'price' | 'description' | 'categoryId' | 'imageFilename' | 'imageMimeType' | 'imageUpdatedAt'
  >
  quantity: number
}

export interface Cart {
  userId: number
  items: CartItem[]
  total: number
}

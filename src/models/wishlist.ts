import { Product } from './product'

export interface Wishlist {
  userId: number
  products: Array<
    Pick<
      Product,
      'id' | 'name' | 'price' | 'description' | 'categoryId' | 'imageFilename' | 'imageMimeType' | 'imageUpdatedAt'
    >
  >
}

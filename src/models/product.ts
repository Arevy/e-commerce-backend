import { Category } from './category'

export interface Product {
  id: number
  name: string
  price: number
  description?: string | null
  categoryId?: number | null
  category?: Category | null
  imageFilename?: string | null
  imageMimeType?: string | null
  imageUpdatedAt?: string | null
}

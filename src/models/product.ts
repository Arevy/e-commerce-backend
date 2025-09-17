import { Category } from './category'

export interface Product {
  id: number
  name: string
  price: number
  description?: string | null
  categoryId?: number | null
  category?: Category | null
}

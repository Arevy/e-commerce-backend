export interface Product {
    id: number
    name: string
    price: number
    description: string
    categoryId?: number | null
    category?: {
      id: number
      name: string
    } | null
  }
  
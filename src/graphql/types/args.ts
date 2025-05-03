export interface PaginationArgs {
  limit?: number
  offset?: number
}

export interface NameFilterArgs {
  name?: string
}

export interface CategoryFilterArgs extends PaginationArgs, NameFilterArgs {}

export interface ProductFilterArgs extends PaginationArgs, NameFilterArgs {
  categoryId?: number
}

export interface OrderProductInput {
  productId: number
  quantity: number
  price: number
}

export interface CreateOrderArgs {
  userId: number
  products: OrderProductInput[]
}

export interface UpdateOrderStatusArgs {
  orderId: number
  status: string
}

export interface DeleteOrderArgs {
  orderId: number
}

export interface RegisterArgs {
  email: string
  password: string
  name?: string
}

export interface LoginArgs {
  email: string
  password: string
}

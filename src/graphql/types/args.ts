export interface PaginationArgs {
  limit?: number
  offset?: number
}

export interface NameFilterArgs {
  name?: string
}

export interface CategoryFilterArgs extends PaginationArgs, NameFilterArgs {}

export interface ProductFilterArgs extends PaginationArgs, NameFilterArgs {
  categoryId?: string | number
}

export interface OrderProductInput {
  productId: number | string
  quantity: number
  price: number
}

export interface ProductImageUploadInput {
  filename: string
  mimeType: string
  base64Data: string
}

export interface CreateOrderArgs {
  userId: number | string
  products: OrderProductInput[]
}

export interface UpdateOrderStatusArgs {
  orderId: number | string
  status: string
}

export interface DeleteOrderArgs {
  orderId: number | string
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

export interface UpdateUserProfileArgs {
  input: {
    name?: string | null
    email?: string | null
    currentPassword: string
  }
}

export interface ChangeUserPasswordArgs {
  currentPassword: string
  newPassword: string
}

export interface Order {
    id: number
    userId: number
    total: number
    status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
    createdAt: Date
    updatedAt: Date
    products: OrderProduct[]
  }
  
  export interface OrderProduct {
    productId: number
    quantity: number
    price: number
  }
  
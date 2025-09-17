import { ProductService } from '../../services/productService'
import { CategoryService } from '../../services/categoryService'
import { UserService } from '../../services/userService'
import { OrderService } from '../../services/orderService'
import { AddressService } from '../../services/addressService'
import { PaymentService } from '../../services/paymentService'
import { CartService } from '../../services/cartService'
import { WishlistService } from '../../services/wishlistService'
import { ReviewService } from '../../services/reviewService'
import { validateInput } from '../../utils/validateInput'
import { UserRole } from '../../models/user'

export const customerSupportResolver = {
  Query: {
    customerSupport: () => ({}),
  },

  Mutation: {
    customerSupport: () => ({}),
  },

  CustomerSupportQuery: {
    users: (
      _: unknown,
      args: { email?: string; role?: UserRole },
    ) => UserService.getAll(args),

    user: (_: unknown, { id }: { id: string }) =>
      UserService.getById(Number(id)),

    products: (_: unknown, args: {
      limit?: number
      offset?: number
      name?: string
      categoryId?: string
    }) =>
      ProductService.getAll(
        args.limit,
        args.offset,
        args.name,
        args.categoryId ? Number(args.categoryId) : undefined,
      ),

    product: (_: unknown, { id }: { id: string }) =>
      ProductService.getById(Number(id)),

    categories: (_: unknown, args: {
      limit?: number
      offset?: number
      name?: string
    }) => CategoryService.getAll(args.limit, args.offset, args.name),

    category: (_: unknown, { id }: { id: string }) =>
      CategoryService.getById(Number(id)),

    orders: (
      _: unknown,
      args: {
        userId?: string
        status?: string
        limit?: number
        offset?: number
      },
    ) =>
      OrderService.getAll({
        userId: args.userId ? Number(args.userId) : undefined,
        status: args.status,
        limit: args.limit,
        offset: args.offset,
      }),

    order: (_: unknown, { id }: { id: string }) =>
      OrderService.getById(Number(id)),

    addresses: (_: unknown, args: { userId?: string }) =>
      AddressService.getAll(args.userId ? Number(args.userId) : undefined),

    address: (_: unknown, { id }: { id: string }) =>
      AddressService.getById(Number(id)),

    payments: (_: unknown, args: { orderId?: string; status?: string }) =>
      PaymentService.getAll({
        orderId: args.orderId ? Number(args.orderId) : undefined,
        status: args.status,
      }),

    payment: (_: unknown, { id }: { id: string }) =>
      PaymentService.getById(Number(id)),

    cart: (_: unknown, { userId }: { userId: string }) =>
      CartService.getCart(Number(userId)),

    wishlist: (_: unknown, { userId }: { userId: string }) =>
      WishlistService.getWishlist(Number(userId)),

    reviews: (
      _: unknown,
      args: { productId?: string; userId?: string },
    ) =>
      ReviewService.getAll({
        productId: args.productId ? Number(args.productId) : undefined,
        userId: args.userId ? Number(args.userId) : undefined,
      }),

    review: (_: unknown, { id }: { id: string }) =>
      ReviewService.getById(Number(id)),
  },

  CustomerSupportMutation: {
    createUser: (
      _: unknown,
      args: {
        email: string
        password: string
        name?: string
        role: UserRole
      },
    ) => {
      validateInput(args, {
        email: { required: true, type: 'string' },
        password: { required: true, type: 'string' },
        role: { required: true, type: 'string' },
      })
      return UserService.create(args.email, args.password, args.name, args.role)
    },

    updateUser: (
      _: unknown,
      args: {
        id: string
        email?: string
        name?: string
        role?: UserRole
        password?: string
      },
    ) => {
      validateInput(args, { id: { required: true, type: 'string' } })
      return UserService.update(Number(args.id), {
        email: args.email,
        name: args.name,
        role: args.role,
        password: args.password,
      })
    },

    deleteUser: (_: unknown, { id }: { id: string }) =>
      UserService.remove(Number(id)),

    addProduct: (
      _: unknown,
      args: {
        name: string
        price: number
        description?: string
        categoryId: string
      },
    ) => {
      validateInput(args, {
        name: { required: true, type: 'string' },
        price: { required: true, type: 'number' },
        categoryId: { required: true, type: 'string' },
      })
      return ProductService.add(
        args.name,
        args.price,
        args.description,
        Number(args.categoryId),
      )
    },

    updateProduct: (
      _: unknown,
      args: {
        id: string
        name?: string
        price?: number
        description?: string
        categoryId?: string
      },
    ) => {
      validateInput(args, { id: { required: true, type: 'string' } })
      return ProductService.update(
        Number(args.id),
        args.name,
        args.price,
        args.description,
        args.categoryId !== undefined ? Number(args.categoryId) : undefined,
      )
    },

    deleteProduct: (_: unknown, { id }: { id: string }) =>
      ProductService.delete(Number(id)),

    addCategory: (
      _: unknown,
      args: { name: string; description?: string },
    ) => {
      validateInput(args, { name: { required: true, type: 'string' } })
      return CategoryService.add(args.name, args.description)
    },

    updateCategory: (
      _: unknown,
      args: { id: string; name?: string; description?: string },
    ) => {
      validateInput(args, { id: { required: true, type: 'string' } })
      return CategoryService.update(
        Number(args.id),
        args.name,
        args.description,
      )
    },

    deleteCategory: (_: unknown, { id }: { id: string }) =>
      CategoryService.delete(Number(id)),

    createOrder: (_: unknown, args: {
      userId: string
      products: Array<{ productId: string; quantity: number; price: number }>
    }) =>
      OrderService.create(
        Number(args.userId),
        args.products.map((item) => ({
          productId: Number(item.productId),
          quantity: item.quantity,
          price: item.price,
        })),
      ),

    updateOrderStatus: (
      _: unknown,
      args: { orderId: string; status: string },
    ) => OrderService.updateStatus(Number(args.orderId), args.status),

    deleteOrder: (_: unknown, { orderId }: { orderId: string }) =>
      OrderService.delete(Number(orderId)),

    addAddress: (
      _: unknown,
      args: {
        userId: string
        street: string
        city: string
        postalCode: string
        country: string
      },
    ) => {
      validateInput(args, {
        userId: { required: true, type: 'string' },
        street: { required: true, type: 'string' },
        city: { required: true, type: 'string' },
        postalCode: { required: true, type: 'string' },
        country: { required: true, type: 'string' },
      })
      return AddressService.add(
        Number(args.userId),
        args.street,
        args.city,
        args.postalCode,
        args.country,
      )
    },

    updateAddress: (
      _: unknown,
      args: {
        addressId: string
        street?: string
        city?: string
        postalCode?: string
        country?: string
      },
    ) => {
      validateInput(args, {
        addressId: { required: true, type: 'string' },
      })
      return AddressService.update(
        Number(args.addressId),
        args.street,
        args.city,
        args.postalCode,
        args.country,
      )
    },

    deleteAddress: (_: unknown, { addressId }: { addressId: string }) =>
      AddressService.delete(Number(addressId)),

    createPayment: (
      _: unknown,
      args: { orderId: string; amount: number; method: string },
    ) => {
      validateInput(args, {
        orderId: { required: true, type: 'string' },
        amount: { required: true, type: 'number' },
        method: { required: true, type: 'string' },
      })
      return PaymentService.create(
        Number(args.orderId),
        args.amount,
        args.method,
      )
    },

    updatePaymentStatus: (
      _: unknown,
      args: { paymentId: string; status: string },
    ) => PaymentService.updateStatus(Number(args.paymentId), args.status),

    deletePayment: (_: unknown, { paymentId }: { paymentId: string }) =>
      PaymentService.remove(Number(paymentId)),

    addReview: (
      _: unknown,
      args: {
        productId: string
        userId: string
        rating: number
        reviewText?: string
      },
    ) => {
      validateInput(args, {
        productId: { required: true, type: 'string' },
        userId: { required: true, type: 'string' },
        rating: { required: true, type: 'number' },
      })
      return ReviewService.add(
        Number(args.productId),
        Number(args.userId),
        args.rating,
        args.reviewText,
      )
    },

    updateReview: (
      _: unknown,
      args: { reviewId: string; rating?: number; reviewText?: string },
    ) => {
      validateInput(args, { reviewId: { required: true, type: 'string' } })
      return ReviewService.update(
        Number(args.reviewId),
        args.rating,
        args.reviewText,
      )
    },

    deleteReview: (_: unknown, { reviewId }: { reviewId: string }) =>
      ReviewService.delete(Number(reviewId)),

    addToCart: (
      _: unknown,
      args: {
        userId: string
        item: { productId: string; quantity: number }
      },
    ) => {
      validateInput(args, { userId: { required: true, type: 'string' } })
      validateInput(args.item, {
        productId: { required: true, type: 'string' },
        quantity: { required: true, type: 'number' },
      })
      return CartService.addToCart(
        Number(args.userId),
        Number(args.item.productId),
        args.item.quantity,
      )
    },

    removeFromCart: (
      _: unknown,
      args: { userId: string; productId: string },
    ) => {
      validateInput(args, {
        userId: { required: true, type: 'string' },
        productId: { required: true, type: 'string' },
      })
      return CartService.removeFromCart(
        Number(args.userId),
        Number(args.productId),
      )
    },

    clearCart: (_: unknown, { userId }: { userId: string }) => {
      validateInput({ userId }, { userId: { required: true, type: 'string' } })
      return CartService.clearCart(Number(userId))
    },

    addToWishlist: (
      _: unknown,
      args: { userId: string; productId: string },
    ) => {
      validateInput(args, {
        userId: { required: true, type: 'string' },
        productId: { required: true, type: 'string' },
      })
      return WishlistService.addToWishlist(
        Number(args.userId),
        Number(args.productId),
      )
    },

    removeFromWishlist: (
      _: unknown,
      args: { userId: string; productId: string },
    ) => {
      validateInput(args, {
        userId: { required: true, type: 'string' },
        productId: { required: true, type: 'string' },
      })
      return WishlistService.removeFromWishlist(
        Number(args.userId),
        Number(args.productId),
      )
    },
  },
}

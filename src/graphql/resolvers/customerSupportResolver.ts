import { ProductService } from '../../services/productService'
import { CategoryService } from '../../services/categoryService'
import { UserService } from '../../services/userService'
import { OrderService } from '../../services/orderService'
import { AddressService } from '../../services/addressService'
import { PaymentService } from '../../services/paymentService'
import { CartService } from '../../services/cartService'
import { WishlistService } from '../../services/wishlistService'
import { ReviewService } from '../../services/reviewService'
import { UserContextService } from '../../services/userContextService'
import { validateInput } from '../../utils/validateInput'
import { UserRole } from '../../models/user'

const toOptionalNumber = (value?: string | null) => {
  if (value === null || value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return undefined
  }

  return parsed
}

export const customerSupportResolver = {
  Query: {
    customerSupport: () => ({}),
  },

  Mutation: {
    customerSupport: () => ({}),
  },

  CustomerSupportQuery: {
    users: (_: unknown, args: { email?: string; role?: UserRole }) =>
      UserService.getAll(args),

    user: (_: unknown, { id }: { id: string }) =>
      UserService.getById(toOptionalNumber(id) ?? 0),

    products: (
      _: unknown,
      args: {
        limit?: number
        offset?: number
        name?: string
        categoryId?: string
      },
    ) =>
      ProductService.getAll(
        args.limit,
        args.offset,
        args.name?.trim() || undefined,
        toOptionalNumber(args.categoryId ?? undefined),
      ),

    product: (_: unknown, { id }: { id: string }) =>
      ProductService.getById(toOptionalNumber(id) ?? 0),

    categories: (
      _: unknown,
      args: { limit?: number; offset?: number; name?: string },
    ) =>
      CategoryService.getAll(
        args.limit,
        args.offset,
        args.name?.trim() || undefined,
      ),

    category: (_: unknown, { id }: { id: string }) =>
      CategoryService.getById(toOptionalNumber(id) ?? 0),

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
        userId: toOptionalNumber(args.userId ?? undefined),
        status: args.status?.trim().toUpperCase() || undefined,
        limit: args.limit,
        offset: args.offset,
      }),

    order: (_: unknown, { id }: { id: string }) =>
      OrderService.getById(toOptionalNumber(id) ?? 0),

    addresses: (_: unknown, args: { userId?: string }) =>
      AddressService.getAll(toOptionalNumber(args.userId ?? undefined)),

    address: (_: unknown, { id }: { id: string }) =>
      AddressService.getById(toOptionalNumber(id) ?? 0),

    payments: (_: unknown, args: { orderId?: string; status?: string }) =>
      PaymentService.getAll({
        orderId: toOptionalNumber(args.orderId ?? undefined),
        status: args.status?.trim() || undefined,
      }),

    payment: (_: unknown, { id }: { id: string }) =>
      PaymentService.getById(toOptionalNumber(id) ?? 0),

    cart: (_: unknown, { userId }: { userId: string }) =>
      CartService.getCart(toOptionalNumber(userId) ?? 0),

    wishlist: (_: unknown, { userId }: { userId: string }) =>
      WishlistService.getWishlist(toOptionalNumber(userId) ?? 0),

    userContext: (_: unknown, { userId }: { userId: string }) =>
      UserContextService.getContext(toOptionalNumber(userId) ?? 0),

    reviews: (_: unknown, args: { productId?: string; userId?: string }) =>
      ReviewService.getAll({
        productId: toOptionalNumber(args.productId ?? undefined),
        userId: toOptionalNumber(args.userId ?? undefined),
      }),

    review: (_: unknown, { id }: { id: string }) =>
      ReviewService.getById(toOptionalNumber(id) ?? 0),
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
      return UserService.update(toOptionalNumber(args.id) ?? 0, {
        email: args.email,
        name: args.name,
        role: args.role,
        password: args.password,
      })
    },

    deleteUser: (_: unknown, { id }: { id: string }) =>
      UserService.remove(toOptionalNumber(id) ?? 0),

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
        toOptionalNumber(args.categoryId) ?? 0,
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
        toOptionalNumber(args.id) ?? 0,
        args.name,
        args.price,
        args.description,
        toOptionalNumber(args.categoryId ?? undefined),
      )
    },

    deleteProduct: (_: unknown, { id }: { id: string }) =>
      ProductService.delete(toOptionalNumber(id) ?? 0),

    addCategory: (_: unknown, args: { name: string; description?: string }) => {
      validateInput(args, { name: { required: true, type: 'string' } })
      return CategoryService.add(args.name, args.description)
    },

    updateCategory: (
      _: unknown,
      args: { id: string; name?: string; description?: string },
    ) => {
      validateInput(args, { id: { required: true, type: 'string' } })
      return CategoryService.update(
        toOptionalNumber(args.id) ?? 0,
        args.name,
        args.description,
      )
    },

    deleteCategory: (_: unknown, { id }: { id: string }) =>
      CategoryService.delete(toOptionalNumber(id) ?? 0),

    createOrder: (
      _: unknown,
      args: {
        userId: string
        products: Array<{ productId: string; quantity: number; price: number }>
      },
    ) =>
      OrderService.create(
        toOptionalNumber(args.userId) ?? 0,
        args.products.map((item) => ({
          productId: toOptionalNumber(item.productId) ?? 0,
          quantity: item.quantity,
          price: item.price,
        })),
      ),

    updateOrderStatus: (
      _: unknown,
      args: { orderId: string; status: string },
    ) =>
      OrderService.updateStatus(
        toOptionalNumber(args.orderId) ?? 0,
        args.status,
      ),

    deleteOrder: (_: unknown, { orderId }: { orderId: string }) =>
      OrderService.delete(toOptionalNumber(orderId) ?? 0),

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
        toOptionalNumber(args.userId) ?? 0,
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
        toOptionalNumber(args.addressId) ?? 0,
        args.street,
        args.city,
        args.postalCode,
        args.country,
      )
    },

    deleteAddress: (_: unknown, { addressId }: { addressId: string }) =>
      AddressService.delete(toOptionalNumber(addressId) ?? 0),

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
        toOptionalNumber(args.orderId) ?? 0,
        args.amount,
        args.method,
      )
    },

    updatePaymentStatus: (
      _: unknown,
      args: { paymentId: string; status: string },
    ) =>
      PaymentService.updateStatus(
        toOptionalNumber(args.paymentId) ?? 0,
        args.status,
      ),

    deletePayment: (_: unknown, { paymentId }: { paymentId: string }) =>
      PaymentService.remove(toOptionalNumber(paymentId) ?? 0),

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
        toOptionalNumber(args.productId) ?? 0,
        toOptionalNumber(args.userId) ?? 0,
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
        toOptionalNumber(args.reviewId) ?? 0,
        args.rating,
        args.reviewText,
      )
    },

    deleteReview: (_: unknown, { reviewId }: { reviewId: string }) =>
      ReviewService.delete(toOptionalNumber(reviewId) ?? 0),

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
        toOptionalNumber(args.userId) ?? 0,
        toOptionalNumber(args.item.productId) ?? 0,
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
        toOptionalNumber(args.userId) ?? 0,
        toOptionalNumber(args.productId) ?? 0,
      )
    },

    clearCart: (_: unknown, { userId }: { userId: string }) => {
      validateInput({ userId }, { userId: { required: true, type: 'string' } })
      return CartService.clearCart(toOptionalNumber(userId) ?? 0)
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
        toOptionalNumber(args.userId) ?? 0,
        toOptionalNumber(args.productId) ?? 0,
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
        toOptionalNumber(args.userId) ?? 0,
        toOptionalNumber(args.productId) ?? 0,
      )
    },
  },
}

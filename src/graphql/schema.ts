export const typeDefs = /* GraphQL */ `
  ####################
  # Type Definitions #
  ####################

  type Product {
    id: ID!
    name: String!
    price: Float!
    description: String
    categoryId: ID
    category: Category
  }

  type Category {
    id: ID!
    name: String!
    description: String
  }

  type User {
    id: ID!
    email: String!
    name: String
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  ####################
  # OrderProduct    #
  ####################

  type OrderProduct {
    productId: ID!
    quantity: Int!
    price: Float!
  }

  input OrderProductInput {
    productId: ID!
    quantity: Int!
    price: Float!
  }

  ####################
  # Order           #
  ####################

  type Order {
    id: ID!
    userId: ID!
    total: Float!
    status: String!
    createdAt: String
    updatedAt: String
    products: [OrderProduct!]!
  }

  ###########
  # Cart    #
  ###########

  type CartProduct {
    id: ID!
    name: String!
    price: Float!
    description: String
    categoryId: ID
  }

  type CartItem {
    product: CartProduct!
    quantity: Int!
  }

  type Cart {
    items: [CartItem!]!
    total: Float!
  }

  ###########
  # Wishlist#
  ###########

  type Wishlist {
    products: [Product!]!
  }

  ###########
  # Review  #
  ###########

  type Review {
    id: ID!
    productId: ID!
    userId: ID!
    rating: Int!
    reviewText: String
    createdAt: String!
  }

  ###########
  # Address #
  ###########

  type Address {
    id: ID!
    userId: ID!
    street: String!
    city: String!
    postalCode: String!
    country: String!
  }

  ###########
  # Payment #
  ###########

  type Payment {
    id: ID!
    orderId: ID!
    amount: Float!
    method: String!
    status: String!
    createdAt: String!
  }

  #############
  # InputTypes#
  #############

  input CartItemInput {
    productId: ID!
    quantity: Int!
  }

  #########
  # Query #
  #########

  type Query {
    getProducts(limit: Int, offset: Int, name: String, categoryId: ID): [Product!]!
    getProductById(id: ID!): Product

    getCategories(limit: Int, offset: Int, name: String): [Category!]!

    getUsers: [User!]!
    getOrders(userId: ID!): [Order!]!

    getCart(userId: ID!): Cart!
    getWishlist(userId: ID!): Wishlist!
    getReviews(productId: ID!): [Review!]!
    getAddresses(userId: ID!): [Address!]!
    getPayment(paymentId: ID!): Payment
  }

  ############
  # Mutation #
  ############

  type Mutation {
    # Products
    addProduct(
      name: String!
      price: Float!
      description: String
      categoryId: ID!
    ): Product!
    updateProduct(
      id: ID!
      name: String
      price: Float
      description: String
      categoryId: ID
    ): Product!
    deleteProduct(id: ID!): Boolean!

    # Categories
    addCategory(name: String!, description: String): Category!
    updateCategory(id: ID!, name: String, description: String): Category!
    deleteCategory(id: ID!): Boolean!

    # Auth / Users
    register(email: String!, password: String!, name: String): User!
    login(email: String!, password: String!): AuthPayload!

    # Orders
    createOrder(userId: ID!, products: [OrderProductInput!]!): Order!
    updateOrderStatus(orderId: ID!, status: String!): Boolean!
    deleteOrder(orderId: ID!): Boolean!

    # Cart
    addToCart(userId: ID!, item: CartItemInput!): Cart!
    removeFromCart(userId: ID!, productId: ID!): Cart!
    clearCart(userId: ID!): Boolean!

    # Wishlist
    addToWishlist(userId: ID!, productId: ID!): Wishlist!
    removeFromWishlist(userId: ID!, productId: ID!): Wishlist!

    # Reviews
    addReview(
      productId: ID!
      userId: ID!
      rating: Int!
      reviewText: String
    ): Review!
    updateReview(
      reviewId: ID!
      rating: Int
      reviewText: String
    ): Review!
    deleteReview(reviewId: ID!): Boolean!

    # Addresses
    addAddress(
      userId: ID!
      street: String!
      city: String!
      postalCode: String!
      country: String!
    ): Address!
    updateAddress(
      addressId: ID!
      street: String
      city: String
      postalCode: String
      country: String
    ): Address!
    deleteAddress(addressId: ID!): Boolean!

    # Payments
    createPayment(orderId: ID!, amount: Float!, method: String!): Payment!
    updatePaymentStatus(paymentId: ID!, status: String!): Payment!
    deletePayment(paymentId: ID!): Boolean!
  }
`

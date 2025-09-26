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
    image: ProductImage
  }

  type ProductImage {
    filename: String!
    mimeType: String!
    url: String!
    updatedAt: String
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
    role: UserRole!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  enum UserRole {
    CUSTOMER
    SUPPORT
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

  input ProductImageUploadInput {
    filename: String!
    mimeType: String!
    base64Data: String!
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
    image: ProductImage
  }

  type CartItem {
    product: CartProduct!
    quantity: Int!
  }

  type Cart {
    userId: ID!
    items: [CartItem!]!
    total: Float!
  }

  ###########
  # Wishlist#
  ###########

  type Wishlist {
    userId: ID!
    products: [Product!]!
  }

  type UserContext {
    user: User!
    cart: Cart!
    wishlist: Wishlist!
    addresses: [Address!]!
  }

  type ImpersonationTicket {
    token: String!
    expiresAt: String!
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

  ############
  #   CMS    #
  ############

  enum CmsStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
  }

  type CmsPage {
    id: ID!
    slug: String!
    title: String!
    excerpt: String
    body: String!
    status: CmsStatus!
    publishedAt: String
    updatedAt: String!
    createdAt: String!
  }

  input CmsPageInput {
    slug: String!
    title: String!
    excerpt: String
    body: String!
    status: CmsStatus
    publishedAt: String
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
    getUserContext(userId: ID!): UserContext!
    getReviews(productId: ID!): [Review!]!
    getAddresses(userId: ID!): [Address!]!
    getPayment(paymentId: ID!): Payment
    getCmsPages(status: CmsStatus, search: String): [CmsPage!]!
    getCmsPage(slug: String!): CmsPage

    customerSupport: CustomerSupportQuery!
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
      image: ProductImageUploadInput
    ): Product!
    updateProduct(
      id: ID!
      name: String
      price: Float
      description: String
      categoryId: ID
      image: ProductImageUploadInput
      removeImage: Boolean
    ): Product!
    deleteProduct(id: ID!): Boolean!

    # Categories
    addCategory(name: String!, description: String): Category!
    updateCategory(id: ID!, name: String, description: String): Category!
    deleteCategory(id: ID!): Boolean!

    # Auth / Users
    register(email: String!, password: String!, name: String): User!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    redeemImpersonation(token: String!): User!

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

    # CMS
    createCmsPage(input: CmsPageInput!): CmsPage!
    updateCmsPage(id: ID!, input: CmsPageInput!): CmsPage!
    deleteCmsPage(id: ID!): Boolean!
    publishCmsPage(id: ID!): CmsPage!

    customerSupport: CustomerSupportMutation!
  }

  #########################
  # Customer Support Area #
  #########################

  type CustomerSupportQuery {
    users(email: String, role: UserRole): [User!]!
    user(id: ID!): User

    products(limit: Int, offset: Int, name: String, categoryId: ID): [Product!]!
    product(id: ID!): Product

    categories(limit: Int, offset: Int, name: String): [Category!]!
    category(id: ID!): Category

    orders(
      userId: ID
      status: String
      limit: Int
      offset: Int
    ): [Order!]!
    order(id: ID!): Order

    addresses(userId: ID): [Address!]!
    address(id: ID!): Address

    payments(orderId: ID, status: String): [Payment!]!
    payment(id: ID!): Payment

    cart(userId: ID!): Cart!
    wishlist(userId: ID!): Wishlist!
    userContext(userId: ID!): UserContext!

    reviews(productId: ID, userId: ID): [Review!]!
    review(id: ID!): Review

    cmsPages(status: CmsStatus, search: String): [CmsPage!]!
    cmsPage(id: ID, slug: String): CmsPage
  }

  type CustomerSupportMutation {
    createUser(
      email: String!
      password: String!
      name: String
      role: UserRole!
    ): User!
    updateUser(
      id: ID!
      email: String
      name: String
      role: UserRole
      password: String
    ): User!
    deleteUser(id: ID!): Boolean!
    logoutUserSessions(userId: ID!): Boolean!
    impersonateUser(userId: ID!): ImpersonationTicket!

    addProduct(
      name: String!
      price: Float!
      description: String
      categoryId: ID!
      image: ProductImageUploadInput
    ): Product!
    updateProduct(
      id: ID!
      name: String
      price: Float
      description: String
      categoryId: ID
      image: ProductImageUploadInput
      removeImage: Boolean
    ): Product!
    deleteProduct(id: ID!): Boolean!

    addCategory(name: String!, description: String): Category!
    updateCategory(id: ID!, name: String, description: String): Category!
    deleteCategory(id: ID!): Boolean!

    createOrder(userId: ID!, products: [OrderProductInput!]!): Order!
    updateOrderStatus(orderId: ID!, status: String!): Boolean!
    deleteOrder(orderId: ID!): Boolean!

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

    createPayment(orderId: ID!, amount: Float!, method: String!): Payment!
    updatePaymentStatus(paymentId: ID!, status: String!): Payment!
    deletePayment(paymentId: ID!): Boolean!

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

    addToCart(userId: ID!, item: CartItemInput!): Cart!
    removeFromCart(userId: ID!, productId: ID!): Cart!
    clearCart(userId: ID!): Boolean!

    addToWishlist(userId: ID!, productId: ID!): Wishlist!
    removeFromWishlist(userId: ID!, productId: ID!): Wishlist!

    createCmsPage(input: CmsPageInput!): CmsPage!
    updateCmsPage(id: ID!, input: CmsPageInput!): CmsPage!
    publishCmsPage(id: ID!): CmsPage!
    deleteCmsPage(id: ID!): Boolean!
  }
`

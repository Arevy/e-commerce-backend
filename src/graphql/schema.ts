import { buildSchema } from 'graphql'

export default buildSchema(`
  ####################
  # Type Definitions #
  ####################

  type Product {
    id: ID!
    name: String!
    price: Float!
    description: String
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

  type Order {
    id: ID!
    userId: ID!
    total: Float!
    status: String!
    createdAt: String
    updatedAt: String
    products: [OrderProduct!]!
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
  }

  ###########
  # Mutation #
  ###########

  type Mutation {
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
    ): Product!

    deleteProduct(id: ID!): Boolean!

    addCategory(name: String!, description: String): Category!
    updateCategory(id: ID!, name: String, description: String): Category!
    deleteCategory(id: ID!): Boolean!

    register(email: String!, password: String!, name: String): User!
    login(email: String!, password: String!): AuthPayload!

    createOrder(userId: ID!, products: [OrderProductInput!]!): Order!
    updateOrderStatus(orderId: ID!, status: String!): Boolean!
    deleteOrder(orderId: ID!): Boolean!
  }
`)

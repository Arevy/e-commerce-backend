import { buildSchema } from 'graphql'

export default buildSchema(`
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

type Query {
  getProducts(limit: Int, offset: Int, name: String, categoryId: ID): [Product]
  getProductById(id: ID!): Product
  getCategories(limit: Int, offset: Int, name: String): [Category]
}

type Mutation {
  addProduct(name: String!, price: Float!, description: String, categoryId: ID!): Product
  updateProduct(id: ID!, name: String, price: Float, description: String): Product
  deleteProduct(id: ID!): Boolean

  addCategory(name: String!, description: String): Category
  updateCategory(id: ID!, name: String, description: String): Category
  deleteCategory(id: ID!): Boolean
}
`)

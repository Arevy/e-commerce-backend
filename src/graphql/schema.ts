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
  getProducts: [Product]
  getCategories: [Category]
}

type Mutation {
  addProduct(name: String!, price: Float!, description: String, categoryId: ID!): Product
  addCategory(name: String!, description: String): Category
  updateProduct(id: ID!, name: String, price: Float, description: String): Product
  deleteProduct(id: ID!): Boolean
}
`)

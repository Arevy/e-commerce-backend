"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
exports.default = (0, graphql_1.buildSchema)(`
  type Product {
    id: ID!
    name: String!
    price: Float!
    description: String
  }

  type Query {
    getProducts: [Product]
  }

  type Mutation {
    addProduct(name: String!, price: Float!, description: String): Product
    updateProduct(id: ID!, name: String, price: Float, description: String): Product
    deleteProduct(id: ID!): Boolean
  }
`);

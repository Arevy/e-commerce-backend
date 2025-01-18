"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productResolver = void 0;
const productService_1 = require("../../services/productService");
let products = [
    {
        id: '1',
        name: 'Laptop',
        price: 999.99,
        description: 'High-performance laptop',
    },
];
exports.productResolver = {
    Query: {
        getProducts: async () => {
            try {
                const products = await productService_1.ProductService.getAll();
                console.log('Fetched products from database:', products);
                return products;
            }
            catch (err) {
                console.error('Error in getProducts resolver:', err);
                return null;
            }
        },
    },
    Mutation: {
        addProduct: async (_, args) => {
            try {
                console.log('Received arguments for addProduct:', args);
                const newProduct = await productService_1.ProductService.add(args.name, args.price, args.description);
                console.log('Added product to database:', newProduct);
                return newProduct;
            }
            catch (err) {
                console.error('Error in addProduct resolver:', err);
                return null;
            }
        },
        updateProduct: async (_, args) => await productService_1.ProductService.update(args.id, args.name, args.price, args.description),
        deleteProduct: async (_, args) => await productService_1.ProductService.delete(args.id),
        // updateProduct: async (_: any, args: any) => {
        //   const product = products.find((p) => p.id === args.id)
        //   if (!product) throw new Error('Product not found')
        //   Object.assign(product, args)
        //   return product
        // },
        // deleteProduct: async (_: any, { id }: any) => {
        //   const index = products.findIndex((p) => p.id === id)
        //   if (index === -1) throw new Error('Product not found')
        //   products.splice(index, 1)
        //   return true
        // },
    },
};

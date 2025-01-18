"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductService = void 0;
const database_1 = require("../config/database");
exports.ProductService = {
    getAll: async () => await (0, database_1.getProductsFromDB)(),
    add: async (name, price, description) => await (0, database_1.addProductToDB)(name, price, description),
    update: async (id, name, price, description) => await (0, database_1.updateProductInDB)(id, name, price, description),
    delete: async (id) => await (0, database_1.deleteProductFromDB)(id),
};

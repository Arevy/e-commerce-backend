"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductsFromDB = exports.deleteProductFromDB = exports.updateProductInDB = exports.addProductToDB = exports.connectToDatabase = void 0;
// @ts-ignore
const oracledb_1 = __importDefault(require("oracledb"));
const connectToDatabase = async () => {
    try {
        await oracledb_1.default.createPool({
            user: process.env.DB_USER || 'AREVY', //'SYS',
            password: process.env.DB_PASSWORD || 'mantrans', //'mypassword1',
            connectString: process.env.DB_CONNECT_STRING || 'localhost:1521/ORCLCDB',
            // role: process.env.DB_USER_ROLE || "SYSDBA"
        });
        console.log('Connected to Oracle Database');
    }
    catch (err) {
        console.error('Error connecting to Oracle Database:', err);
        process.exit(1);
    }
};
exports.connectToDatabase = connectToDatabase;
const addProductToDB = async (name, price, description) => {
    try {
        const connection = await oracledb_1.default.getConnection();
        console.log('Connection established for addProductToDB');
        const result = await connection.execute(`INSERT INTO PRODUCTS (NAME, PRICE, DESCRIPTION) VALUES (:name, :price, :description) RETURNING ID INTO :id`, {
            name,
            price,
            description,
            id: { dir: oracledb_1.default.BIND_OUT, type: oracledb_1.default.NUMBER },
        }, { autoCommit: true });
        console.log('Insert result:', result);
        return { id: result.outBinds.id[0], name, price, description };
    }
    catch (err) {
        console.error('Error in addProductToDB:', err);
        throw err;
    }
};
exports.addProductToDB = addProductToDB;
const updateProductInDB = async (id, name, price, description) => {
    const connection = await oracledb_1.default.getConnection();
    const result = await connection.execute(`UPDATE PRODUCTS SET 
      NAME = COALESCE(:name, NAME),
      PRICE = COALESCE(:price, PRICE),
      DESCRIPTION = COALESCE(:description, DESCRIPTION)
    WHERE ID = :id`, { id, name, price, description }, { autoCommit: true });
    return result.rowsAffected > 0;
};
exports.updateProductInDB = updateProductInDB;
const deleteProductFromDB = async (id) => {
    const connection = await oracledb_1.default.getConnection();
    const result = await connection.execute(`DELETE FROM PRODUCTS WHERE ID = :id`, { id }, { autoCommit: true });
    return result.rowsAffected > 0;
};
exports.deleteProductFromDB = deleteProductFromDB;
const getProductsFromDB = async () => {
    try {
        const connection = await oracledb_1.default.getConnection();
        console.log('Connection established for getProductsFromDB');
        const result = await connection.execute(`SELECT ID, NAME, PRICE, DESCRIPTION FROM PRODUCTS`);
        console.log('Query result:', result);
        return result.rows.map((row) => ({
            id: row[0],
            name: row[1],
            price: row[2],
            description: row[3],
        }));
    }
    catch (err) {
        console.error('Error in getProductsFromDB:', err);
        throw err;
    }
};
exports.getProductsFromDB = getProductsFromDB;

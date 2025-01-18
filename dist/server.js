"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const express_1 = __importDefault(require("express"));
const express_graphql_1 = require("express-graphql");
const schema_1 = __importDefault(require("./graphql/schema"));
const database_1 = require("./config/database");
const schema_2 = require("@graphql-tools/schema");
const productResolver_1 = require("./graphql/resolvers/productResolver");
const startServer = async () => {
    const app = (0, express_1.default)();
    await (0, database_1.connectToDatabase)();
    const executableSchema = (0, schema_2.makeExecutableSchema)({
        typeDefs: schema_1.default,
        resolvers: productResolver_1.productResolver,
    });
    app.use('/graphql', (0, express_graphql_1.graphqlHTTP)({
        schema: schema_1.default,
        graphiql: true,
    }));
    app.use('/graphql', (0, express_graphql_1.graphqlHTTP)({
        schema: executableSchema,
        graphiql: true,
    }));
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}/graphql`);
    });
};
exports.startServer = startServer;

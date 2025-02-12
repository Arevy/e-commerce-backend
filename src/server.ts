import express from 'express'
import { graphqlHTTP } from 'express-graphql'
import schema from './graphql/schema'
import { closeDatabaseConnection, connectToDatabase } from './config/database'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { productResolver } from './graphql/resolvers/productResolver'
import { categoryResolver } from './graphql/resolvers/categoryResolver'
import { logger } from './utils/logger'
import { orderResolver } from './graphql/resolvers/orderResolver'
import { userResolver } from './graphql/resolvers/userResolver'

export const startServer = async () => {
  const app = express()

  app.use((req, res, next) => {
    logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
    next()
  })
  await connectToDatabase()
  const executableSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers: [productResolver, categoryResolver, orderResolver, userResolver],
  })

  app.use(
    '/graphql',
    graphqlHTTP({
      schema: executableSchema,
      graphiql: true,
      customFormatErrorFn: (error) => {
        logger.error('[GraphQL Error]', error.message)
        return {
          message: error.message,
          locations: error.locations,
          path: error.path,
        }
      },
    }),
  )

  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}/graphql`)
  })

  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`)
    next()
  })
  // await startServer()

  process.on('SIGINT', async () => {
    logger.info('SIGINT received. Closing connection pool...')
    await closeDatabaseConnection()
    process.exit(0)
  })
}

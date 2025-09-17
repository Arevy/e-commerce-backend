import express from 'express'
import { graphqlHTTP } from 'express-graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { typeDefs } from './graphql/schema'
import { logger } from './utils/logger'
import { addressResolver } from './graphql/resolvers/addressResolver'
import { cartResolver } from './graphql/resolvers/cartResolver'
import { categoryResolver } from './graphql/resolvers/categoryResolver'
import { orderResolver } from './graphql/resolvers/orderResolver'
import { paymentResolver } from './graphql/resolvers/paymentResolver'
import { productResolver } from './graphql/resolvers/productResolver'
import { reviewResolver } from './graphql/resolvers/reviewResolver'
import { userResolver } from './graphql/resolvers/userResolver'
import { wishlistResolver } from './graphql/resolvers/wishlistResolver'
import { customerSupportResolver } from './graphql/resolvers/customerSupportResolver'
import { connectToDatabase, closeDatabaseConnection } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'

export const startServer = async () => {
  const app = express()

  app.use(express.json())

  app.use((req, res, next) => {
    logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
    next()
  })

  await connectToDatabase()
  await connectRedis()

  const executableSchema = makeExecutableSchema({
    typeDefs,
    resolvers: [
      productResolver,
      categoryResolver,
      userResolver,
      orderResolver,
      cartResolver,
      wishlistResolver,
      reviewResolver,
      addressResolver,
      paymentResolver,
      customerSupportResolver,
    ],
  })

  app.use(
    '/graphql',
    graphqlHTTP({
      schema: executableSchema,
      graphiql: true,
      customFormatErrorFn: (error) => {
        logger.error(`[GraphQL Error] ${error.message}`)
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

  const gracefulShutdown = async () => {
    logger.info('Shutting down. Closing resources...')
    await Promise.allSettled([closeDatabaseConnection(), disconnectRedis()])
    process.exit(0)
  }

  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

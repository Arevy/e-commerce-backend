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
import { cmsResolver } from './graphql/resolvers/cmsResolver'
import { connectToDatabase, closeDatabaseConnection } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'

const DEFAULT_LOCAL_ORIGINS = ['http://localhost:3000', 'http://localhost:3100']

const allowedOrigins = (() => {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim()
  if (!raw) {
    return [...DEFAULT_LOCAL_ORIGINS]
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  if (origins.includes('*')) {
    return ['*']
  }

  const unique = new Set(origins)
  DEFAULT_LOCAL_ORIGINS.forEach((origin) => {
    if (origin) {
      unique.add(origin)
    }
  })

  return Array.from(unique)
})()

const allowAnyOrigin = allowedOrigins.includes('*')

export const startServer = async () => {
  const app = express()

  app.use(express.json())

  // Allow the admin portal to call the GraphQL API from a different origin.
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin

    if (allowAnyOrigin) {
      res.header('Access-Control-Allow-Origin', '*')
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.header('Access-Control-Allow-Origin', requestOrigin)
    }

    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }

    next()
  })

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
      cmsResolver,
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

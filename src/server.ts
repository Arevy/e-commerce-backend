import express from 'express'
import type { Request, Response } from 'express'
import { makeExecutableSchema } from '@graphql-tools/schema'
import type { GraphQLError } from 'graphql'
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
import { userContextResolver } from './graphql/resolvers/userContextResolver'
import { connectToDatabase, closeDatabaseConnection } from './config/database'
import { connectRedis, disconnectRedis } from './config/redis'
import { SessionService, parseSessionCookie } from './services/sessionService'
import { ProductService } from './services/productService'
import type { GraphQLContext } from './graphql/context'
import { formatGraphQLError } from './utils/graphqlErrorFormatter'
import { createGraphqlHandler } from './middleware/createGraphqlHandler'

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:5010',
  'http://localhost:8081',
  'http://127.0.0.1:8082',
  'http://127.0.0.1:8083',
]

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

  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '5mb'
  app.use(express.json({ limit: jsonBodyLimit }))

  // Allow the admin portal to call the GraphQL API from a different origin.
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin

    if (allowAnyOrigin && requestOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin)
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.header('Access-Control-Allow-Origin', requestOrigin)
    }

    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.header('Access-Control-Allow-Credentials', 'true')

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

  app.get('/products/:id/image', async (req, res) => {
    const productId = Number(req.params.id)
    if (!Number.isFinite(productId) || productId <= 0) {
      res.status(400).send('Invalid product id')
      return
    }

    try {
      const image = await ProductService.getImageContent(productId)
      if (!image) {
        res.status(404).send('Image not found')
        return
      }

      res.setHeader('Content-Type', image.mimeType)
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(image.filename)}"`,
      )
      res.setHeader('Cache-Control', 'public, max-age=900, must-revalidate')
      res.setHeader('Content-Length', String(image.data.length))
      res.send(image.data)
    } catch (error) {
      logger.error(`Error serving product image ${productId}: ${error}`)
      res.sendStatus(500)
    }
  })

  const executableSchema = makeExecutableSchema({
    typeDefs,
    resolvers: [
      productResolver,
      categoryResolver,
      userResolver,
      orderResolver,
      cartResolver,
      wishlistResolver,
      userContextResolver,
      reviewResolver,
      addressResolver,
      paymentResolver,
      customerSupportResolver,
      cmsResolver,
    ],
  })

  const buildContext = async (
    req: Request,
    res: Response,
  ): Promise<GraphQLContext> => {
    const preferSupport = (() => {
      const indicator = req.headers['x-shopx-support-session']
      if (!indicator) {
        return false
      }

      if (Array.isArray(indicator)) {
        return indicator.some(
          (value) => value === '1' || value?.toLowerCase() === 'true',
        )
      }

      return indicator === '1' || indicator.toLowerCase() === 'true'
    })()

    const sessionId = parseSessionCookie(req.headers.cookie, preferSupport)
    const session = sessionId
      ? await SessionService.getSession(sessionId)
      : null
    return { req, res, session }
  }

  app.use(
    '/graphql',
    createGraphqlHandler(async (req, res) => {
      const context = await buildContext(req as Request, res as Response)
      return {
        schema: executableSchema,
        graphiql: true,
        context,
        customFormatErrorFn: (error: GraphQLError) => formatGraphQLError(error),
      }
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

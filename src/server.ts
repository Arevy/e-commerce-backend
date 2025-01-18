import express from 'express'
import { graphqlHTTP } from 'express-graphql'
import schema from './graphql/schema'
import { closeDatabaseConnection, connectToDatabase } from './config/database'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { productResolver } from './graphql/resolvers/productResolver'
import { categoryResolver } from './graphql/resolvers/categoryResolver'

export const startServer = async () => {
  const app = express()

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
    next()
  })
  await connectToDatabase()
  const executableSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers: [productResolver, categoryResolver],
  })

  app.use(
    '/graphql',
    graphqlHTTP({
      schema: executableSchema,
      graphiql: true,
    }),
  )

  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/graphql`)
  })

  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`)
    next()
  })
  // await startServer()

  process.on('SIGINT', async () => {
    console.log('SIGINT received. Closing connection pool...')
    await closeDatabaseConnection()
    process.exit(0)
  })
}

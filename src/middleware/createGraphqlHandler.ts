import type { Request, Response, NextFunction } from 'express'
import { graphqlHTTP } from 'express-graphql'
import type { Options } from 'express-graphql'

type JsonBody = Record<string, unknown> & {
  data?: unknown
  errors?: unknown
}

const normalizeGraphQLPayload = (body: unknown): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) {
    return body
  }

  const payload: JsonBody = { ...(body as JsonBody) }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    payload.data = null
  }

  if (!('data' in payload)) {
    payload.data = payload.data ?? null
  }

  return payload
}

export const createGraphqlHandler = (options: Options) => {
  const handler = graphqlHTTP(options)

  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res)

    const cleanup = () => {
      res.json = originalJson
    }

    res.json = (body: unknown) => {
      res.status(200)
      const normalized = normalizeGraphQLPayload(body)
      return originalJson(normalized)
    }

    try {
      Promise.resolve(handler(req, res))
        .then(() => {
          cleanup()
        })
        .catch((err) => {
          cleanup()
          next(err)
        })
    } catch (err) {
      cleanup()
      next(err)
    }
  }
}

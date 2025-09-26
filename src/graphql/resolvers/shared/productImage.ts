import type { Request } from 'express'
import type { GraphQLContext } from '../../context'

interface ProductLike {
  id: number | string
  imageFilename?: string | null
  imageMimeType?: string | null
  imageUpdatedAt?: string | null
}

const sanitizeBaseUrl = (value: string): string => value.replace(/\/*$/, '')

const inferProtocol = (req: Request): string => {
  const forwardedProto = req.headers['x-forwarded-proto']
  if (Array.isArray(forwardedProto)) {
    return forwardedProto[0] || req.protocol
  }
  return forwardedProto || req.protocol
}

const getPublicBaseUrl = (req: Request): string => {
  const configured = process.env.PUBLIC_ASSET_BASE_URL?.trim()
  if (configured) {
    return sanitizeBaseUrl(configured)
  }

  const protocol = inferProtocol(req)
  const host = req.get('host')
  if (!host) {
    return ''
  }

  return `${protocol}://${host}`.replace(/\/*$/, '')
}

const buildVersionToken = (updatedAt?: string | null): string => {
  if (!updatedAt) {
    return ''
  }
  return `?v=${encodeURIComponent(updatedAt)}`
}

export const resolveProductImage = (
  source: ProductLike,
  context: GraphQLContext,
) => {
  if (!source.imageFilename || !source.imageMimeType) {
    return null
  }

  const baseUrl = getPublicBaseUrl(context.req)
  if (!baseUrl) {
    return null
  }

  const productId = typeof source.id === 'string' ? source.id : String(source.id)
  const url = `${baseUrl}/products/${encodeURIComponent(productId)}/image${buildVersionToken(
    source.imageUpdatedAt,
  )}`

  return {
    filename: source.imageFilename,
    mimeType: source.imageMimeType,
    url,
    updatedAt: source.imageUpdatedAt ?? null,
  }
}

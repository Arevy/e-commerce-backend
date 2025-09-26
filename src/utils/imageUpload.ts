import { ProductImagePayload } from '../services/productService'

export interface ProductImageUploadInput {
  filename: string
  mimeType: string
  base64Data: string
}

const BASE64_REGEX = /^data:[^;]+;base64,/i

const decodeBase64 = (value: string): Buffer => {
  if (!value) {
    throw new Error('Image payload cannot be empty.')
  }

  const sanitized = value.trim()
  const normalized = BASE64_REGEX.test(sanitized)
    ? sanitized.replace(BASE64_REGEX, '')
    : sanitized

  return Buffer.from(normalized, 'base64')
}

export const buildImagePayload = (
  input?: ProductImageUploadInput | null,
): ProductImagePayload | null => {
  if (!input) {
    return null
  }

  if (!input.filename?.trim()) {
    throw new Error('Image filename is required.')
  }

  if (!input.mimeType?.trim()) {
    throw new Error('Image mimeType is required.')
  }

  const data = decodeBase64(input.base64Data)
  if (!data.length) {
    throw new Error('Image data is empty.')
  }

  return {
    filename: input.filename.trim(),
    mimeType: input.mimeType.trim(),
    data,
  }
}

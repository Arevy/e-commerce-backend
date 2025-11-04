import { GraphQLError } from 'graphql'
import { logger } from './logger'

type FormatterOptions = {
  fallbackMessage?: string
}

const GENERIC_MESSAGE = 'An unexpected error occurred. Please try again later.'

const isSafeMessage = (value: string): boolean => {
  if (!value) {
    return false
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  // Filter obvious JSON payloads or stack traces so we do not leak internals.
  if (
    /\{\s*"?[a-z0-9_]+"?\s*:/i.test(trimmed) ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    return false
  }

  if (/ORA-\d+/i.test(trimmed)) {
    return false
  }

  return true
}

export class UserFacingError extends Error {
  public readonly userMessage: string
  public readonly code?: string

  constructor(
    message: string,
    options?: { code?: string; cause?: unknown; logMessage?: string },
  ) {
    super(options?.logMessage ?? message)
    this.name = 'UserFacingError'
    this.userMessage = message
    this.code = options?.code

    if (options?.cause !== undefined) {
      // @ts-ignore Node 16 compatibility: Error.cause is not standard in TS target.
      this.cause = options.cause
    }
  }
}

const resolveMessage = (
  error: GraphQLError,
  options?: FormatterOptions,
): string => {
  const original = error.originalError

  if (original instanceof UserFacingError) {
    return original.userMessage
  }

  if (original instanceof Error) {
    const candidate = original.message?.trim()
    if (isSafeMessage(candidate)) {
      return candidate
    }
  }

  if (
    error.message &&
    error.message.trim() &&
    error.message !== 'INTERNAL_SERVER_ERROR'
  ) {
    const candidate = error.message.trim()
    if (isSafeMessage(candidate)) {
      return candidate
    }
  }

  return options?.fallbackMessage ?? GENERIC_MESSAGE
}

export const formatGraphQLError = (
  error: GraphQLError,
  options?: FormatterOptions,
) => {
  const message = resolveMessage(error, options)
  const original = error.originalError

  if (original instanceof UserFacingError) {
    logger.warn(
      `User facing error: ${original.userMessage} - ${original.message}  - ${original.code} `,
    )
  } else {
    const meta = {
      path: error.path,
      errorMessage: error.message,
      originalMessage: original instanceof Error ? original.message : undefined,
    }
    logger.error(`Unhandled GraphQL error: ${JSON.stringify(meta)}`)
  }

  return {
    message,
    locations: error.locations,
    path: error.path,
    extensions: {
      code:
        original instanceof UserFacingError
          ? (original.code ?? 'USER_FACING_ERROR')
          : 'INTERNAL_SERVER_ERROR',
    },
  }
}

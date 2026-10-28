// Operational logs must not contain request bodies, credentials or SQL bind values.
export function safeLogMessage(value: unknown): string {
  return String(value)
    .slice(0, 2048)
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/gi, '[REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[REDACTED]',
    )
    .replace(
      /\b(?:password|passwd|secret|token|authorization|cookie|api[_-]?key|code)["']?\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '[REDACTED]',
    )
    .replace(
      /(?:https?:\/\/|\/)[^\s"<>]*[?#][^\s"<>]*/g,
      (v) => v.split(/[?#]/)[0] + '?[REDACTED]',
    )
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[IDENTIFIER]')
    .replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')
}

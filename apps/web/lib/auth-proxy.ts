const ORBIT_REQUEST_ID_HEADER = 'X-Orbit-Request-Id'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function extractErrorMessage(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined
  if (typeof data.error === 'string' && data.error.trim().length > 0) return data.error
  if (typeof data.message === 'string' && data.message.trim().length > 0) return data.message
  return undefined
}

export function resolveRequestId(value: string | null | undefined): string {
  const requestId = value?.trim()
  return requestId && requestId.length > 0 ? requestId : crypto.randomUUID()
}

export function buildRequestIdResponseHeaders(requestId: string): Headers {
  return new Headers({
    [ORBIT_REQUEST_ID_HEADER]: requestId,
  })
}

export function resolveResponseRequestId(response: Response, fallbackRequestId: string): string {
  return resolveRequestId(response.headers.get(ORBIT_REQUEST_ID_HEADER) ?? fallbackRequestId)
}

export function buildAuthErrorPayload(
  data: unknown,
  requestId: string,
  fallbackError = 'Authentication failed',
): Record<string, unknown> {
  const error = extractErrorMessage(data) ?? fallbackError

  if (isRecord(data)) {
    return {
      ...data,
      error,
      requestId,
    }
  }

  return {
    error,
    requestId,
  }
}

export function buildEmailLogContext(email: unknown): Record<string, boolean | number | string | undefined> {
  if (typeof email !== 'string') {
    return { hasEmail: false }
  }

  const trimmed = email.trim()
  if (!trimmed) {
    return { hasEmail: false }
  }

  const [localPart, domain] = trimmed.split('@')

  return {
    hasEmail: true,
    emailDomain: domain?.toLowerCase(),
    emailLocalLength: localPart?.length,
  }
}

export { ORBIT_REQUEST_ID_HEADER }

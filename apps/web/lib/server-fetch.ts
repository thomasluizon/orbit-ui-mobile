import { resolveServerSession } from '@/lib/auth-api'
import { createApiClientError } from '@orbit/shared'
import { APP_VERSION_HEADER, validateApiResponse } from '@orbit/shared/utils'
import type { ZodType } from 'zod'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

function parseResponseBody<T>(text: string, schema: ZodType<T> | undefined, path: string): T {
  return validateApiResponse(JSON.parse(text), schema, path)
}

/**
 * Shared authenticated fetch for Server Actions.
 * Resolves the current session, forwards it as Bearer to the .NET API,
 * and throws a structured ApiClientError on failure. When a Zod `schema`
 * is supplied, the response body is validated at the trust boundary and a
 * typed ApiClientError (502) is thrown if it does not match the contract.
 */
export async function serverAuthFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  schema?: ZodType<T>,
): Promise<T> {
  const appVersion = process.env.APP_VERSION
  const buildHeaders = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(appVersion ? { [APP_VERSION_HEADER]: appVersion } : {}),
    ...(init.headers as Record<string, string> | undefined),
  })

  let session = await resolveServerSession()
  if (!session.token) {
    throw createApiClientError(401, { error: 'Unauthorized' }, 'Unauthorized')
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(session.token),
  })

  if (res.status === 401) {
    session = await resolveServerSession({ forceRefresh: true })
    if (session.token) {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: buildHeaders(session.token),
      })
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => null) as Record<string, unknown> | null
    throw createApiClientError(res.status, error, `Failed with status ${res.status}`)
  }
  if (res.status === 204) return null as T
  const text = await res.text()
  if (!text) return null as T
  return parseResponseBody(text, schema, path)
}

/**
 * Unauthenticated server fetch for public, no-auth API routes (e.g. public profiles).
 * Sends no Bearer token, forwards the app version, and returns null on 404 so callers
 * can render a not-found page. Throws an ApiClientError on other non-OK statuses. When a
 * Zod `schema` is supplied, the response body is validated at the trust boundary and a
 * typed ApiClientError (502) is thrown if it does not match the contract.
 */
export async function serverPublicFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  schema?: ZodType<T>,
): Promise<T | null> {
  const appVersion = process.env.APP_VERSION
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(appVersion ? { [APP_VERSION_HEADER]: appVersion } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const error = await res.json().catch(() => null) as Record<string, unknown> | null
    throw createApiClientError(res.status, error, `Failed with status ${res.status}`)
  }
  const text = await res.text()
  if (!text) return null
  return parseResponseBody(text, schema, path)
}

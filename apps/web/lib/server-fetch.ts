import { getAccountIdFromToken, resolveServerSession } from '@/lib/auth-api'
import { createApiClientError } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { APP_VERSION_HEADER, validateApiResponse } from '@orbit/shared/utils'
import type { ZodType } from 'zod'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

function unauthorizedError(sessionRefreshFailed: boolean): Error {
  const error = createApiClientError(401, { error: 'Unauthorized' }, 'Unauthorized')
  if (sessionRefreshFailed) {
    Object.assign(error, { sessionRefreshFailed: true })
  }
  return error
}

function parseResponseBody<T>(text: string, schema: ZodType<T> | undefined, path: string): T {
  return validateApiResponse(JSON.parse(text), schema, path)
}

/**
 * Refuses a request whose intent one account formed and another account's cookie carries.
 *
 * The browser attaches the auth cookie when it sends, not when the person clicks, and every tab
 * shares that one cookie. So a sign in elsewhere between the click and the send puts the next
 * account's credential on the previous account's request, and `DELETE /notifications` then empties
 * an inbox nobody asked about. No client-side counter can stop that, because the counter says what
 * the tab believes and the cookie says what the server will act on. Only a check here, where both
 * are in hand at once, can refuse it.
 *
 * A caller that names no account, and a token whose account cannot be read, both pass: neither one
 * proves a mismatch, and refusing on an unread token would break every write on a token shape
 * change rather than on a real account switch.
 */
function assertIntendedAccountStillHolds(
  token: string,
  intendedAccountId: string | null | undefined,
): void {
  if (!intendedAccountId) return

  const cookieAccountId = getAccountIdFromToken(token)
  if (cookieAccountId === null || cookieAccountId === intendedAccountId) return

  throw createApiClientError(
    409,
    { error: 'The signed in account changed before this request ran', errorCode: 'ACCOUNT_CHANGED' },
    'The signed in account changed before this request ran',
  )
}

/**
 * Shared authenticated fetch for Server Actions.
 * Resolves the current session, forwards it as Bearer to the .NET API,
 * and throws a structured ApiClientError on failure. When a Zod `schema`
 * is supplied, the response body is validated at the trust boundary and a
 * typed ApiClientError (502) is thrown if it does not match the contract.
 * Pass `intendedAccountId` to refuse the request when the cookie has moved
 * to another account since the caller formed it.
 */
export async function serverAuthFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  schema?: ZodType<T>,
  intendedAccountId?: string | null,
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
    throw unauthorizedError(session.refreshFailed)
  }
  assertIntendedAccountStillHolds(session.token, intendedAccountId)

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(session.token),
  })

  if (res.status === 401 && path !== API.auth.refresh) {
    session = await resolveServerSession({ forceRefresh: true })
    if (session.token) {
      assertIntendedAccountStillHolds(session.token, intendedAccountId)
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: buildHeaders(session.token),
      })
    } else if (session.refreshFailed) {
      throw unauthorizedError(true)
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

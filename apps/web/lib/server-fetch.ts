import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
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
  intendedAccountId: string | null,
): void {
  if (!intendedAccountId) return

  const cookieAccountId = getAccountIdFromToken(token)
  if (cookieAccountId === null || cookieAccountId === intendedAccountId) return

  throw createApiClientError(
    409,
    {
      error: 'The signed in account changed before this request ran',
      errorCode: ACCOUNT_CHANGED_ERROR_CODE,
    },
    'The signed in account changed before this request ran',
  )
}

/**
 * A request method that changes server state, and therefore the set `serverAuthMutate` accepts.
 *
 * It is a type rather than a runtime check so a read cannot reach the mutating function at all:
 * the two entry points then describe what they do, instead of both describing what they might do.
 */
type MutatingMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface MutateInit extends Omit<RequestInit, 'method'> {
  method: MutatingMethod
}

/**
 * The init `serverAuthFetch` accepts: a read method, or none at all.
 *
 * Narrowing the method here is what actually holds the line. `serverAuthFetch(path, { method:
 * 'DELETE' })` is a compile error under this type, and so are the casts and the template literal a
 * syntactic lint rule cannot see through.
 */
type ReadInit = Omit<RequestInit, 'method'> & { method?: 'GET' | 'HEAD' }

/**
 * Resolves the session, forwards it as Bearer to the .NET API, and throws a structured
 * ApiClientError on failure. When a Zod `schema` is supplied, the response body is validated at the
 * trust boundary and a typed ApiClientError (502) is thrown if it does not match the contract.
 *
 * Both exported entry points run through here, so the account guard sits on one code path and a
 * later edit cannot apply it to one of them and forget the other.
 */
async function fetchWithSession<T>(
  path: string,
  init: RequestInit,
  schema: ZodType<T> | undefined,
  intendedAccountId: string | null,
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
 * Authenticated READ for Server Actions and server components.
 *
 * It carries no account on purpose. A read under the next account's cookie returns that account's
 * own data, which the cache clear on an account replacement already handles, and a read function
 * that could still take an account is a read function the next author will write a write with.
 * Every state change goes through `serverAuthMutate`, which cannot be called without one.
 */
export async function serverAuthFetch<T = unknown>(
  path: string,
  init: ReadInit = {},
  schema?: ZodType<T>,
): Promise<T> {
  return fetchWithSession(path, init, schema, null)
}

/**
 * Authenticated WRITE for Server Actions, gated by the account that formed the intent.
 *
 * `intendedAccountId` is third and required rather than last and optional, because the optional
 * fourth parameter this replaces is exactly what let a dozen writes forget it: `undefined` for
 * `schema` used to skip straight past the account. Here no argument can be omitted to reach the
 * schema, so a write either names the account or does not compile.
 *
 * `null` is a real value and still sends. A caller that names no account proves no mismatch, and
 * refusing it would break every write that has no account to name rather than a real account
 * switch.
 */
export async function serverAuthMutate<T = unknown>(
  path: string,
  init: MutateInit,
  intendedAccountId: string | null,
  schema?: ZodType<T>,
): Promise<T> {
  return fetchWithSession(path, init, schema, intendedAccountId)
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

import { getServerRequestLanguage } from './request-language'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import { getAccountIdFromToken, resolveServerSession } from '@/lib/auth-api'
import { createApiClientError } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { APP_VERSION_HEADER, validateApiResponse } from '@orbit/shared/utils'
import { z, type ZodType } from 'zod'
import { observeProxyFailure, type RecordProxyUpstream } from './proxy-failure-log'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'
const accountIntentSchema = z.object({
  accountId: z.string().nullable(),
  eventOrigin: z.string().min(1).max(128),
})

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
 * The browser attaches the auth cookie when it sends, not when the person clicks, and every
 * tab shares that one cookie.
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
 * The init `serverAuthFetch` accepts: a read method, or none at all. `serverAuthFetch(path,
 * { method: 'DELETE' })` is a compile error under this type, and so are the casts and the
 * template literal a syntactic lint rule cannot see through.
 */
type ReadInit = Omit<RequestInit, 'method'> & { method?: 'GET' | 'HEAD' }

/**
 * Resolves the session, forwards it as Bearer to the .NET API, and throws a structured
 * ApiClientError on failure. When a Zod `schema` is supplied, the response body is validated
 * at the trust boundary and a typed ApiClientError (502) is thrown if it does not match the
 * contract.
 */
async function fetchWithSession<T>(
  path: string,
  init: RequestInit,
  schema: ZodType<T> | undefined,
  intendedAccountId: string | null,
  recordUpstream?: RecordProxyUpstream,
  renderToken?: string,
): Promise<T> {
  const accountIntent = intendedAccountId?.startsWith('{')
    ? accountIntentSchema.parse(JSON.parse(intendedAccountId) as unknown)
    : { accountId: intendedAccountId, eventOrigin: null }
  const language = await getServerRequestLanguage()
  const appVersion = process.env.APP_VERSION
  const buildHeaders = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(appVersion ? { [APP_VERSION_HEADER]: appVersion } : {}),
    ...(accountIntent.eventOrigin ? { 'X-Orbit-Event-Origin': accountIntent.eventOrigin } : {}),
    ...(init.headers as Record<string, string> | undefined),
    'Accept-Language': language,
  })

  let session = renderToken ? { token: renderToken, refreshFailed: false } : await resolveServerSession()
  if (!session.token) {
    throw unauthorizedError(session.refreshFailed)
  }
  assertIntendedAccountStillHolds(session.token, accountIntent.accountId)

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: buildHeaders(session.token),
  })
  recordUpstream?.(res)

  if (!renderToken && res.status === 401 && path !== API.auth.refresh) {
    session = await resolveServerSession({ forceRefresh: true })
    if (session.token) {
      assertIntendedAccountStillHolds(session.token, accountIntent.accountId)
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: buildHeaders(session.token),
      })
      recordUpstream?.(res)
    } else if (session.refreshFailed) {
      throw unauthorizedError(true)
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => null) as Record<string, unknown> | null
    throw createApiClientError(res.status, error, `Failed with status ${res.status}`, res.headers.get('retry-after'))
  }
  if (res.status === 204) return null as T
  const text = await res.text()
  if (!text) return null as T
  return parseResponseBody(text, schema, path)
}

/**
 * Authenticated READ for Server Actions and server components. Every state change goes
 * through `serverAuthMutate`, which cannot be called without one.
 */
export async function serverAuthFetch<T = unknown>(
  path: string,
  init: ReadInit = {},
  schema?: ZodType<T>,
): Promise<T> {
  return fetchWithSession(path, init, schema, null)
}

export async function serverRenderFetch<T = unknown>(
  path: string,
  init: ReadInit = {},
  schema?: ZodType<T>,
): Promise<T | null> {
  const session = await resolveServerSession({ allowRefresh: false })
  if (!session.token) return null
  return fetchWithSession(path, init, schema, null, undefined, session.token)
}

/**
 * Authenticated WRITE for Server Actions, gated by the account that formed the intent. Here
 * no argument can be omitted to reach the schema, so a write either names the account or
 * does not compile.
 */
export async function serverAuthMutate<T = unknown>(
  path: string,
  init: MutateInit,
  intendedAccountId: string | null,
  schema?: ZodType<T>,
): Promise<T> {
  const astraAction = /^\/api\/ai\/pending-operations\/[^/]+\/(confirm|execute)$/.exec(path)
  if (astraAction) {
    return observeProxyFailure(`/api/ai/pending-operations/:id/${astraAction[1]}`, (recordUpstream) =>
      fetchWithSession(path, init, schema, intendedAccountId, recordUpstream),
    )
  }
  return fetchWithSession(path, init, schema, intendedAccountId)
}

/**
 * Unauthenticated server fetch for public, no-auth API routes (e.g. public profiles). Sends
 * no Bearer token, forwards the app version, and returns null on 404 so callers can render a
 * not-found page.
 */
export async function serverPublicFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  schema?: ZodType<T>,
): Promise<T | null> {
  const language = await getServerRequestLanguage()
  const appVersion = process.env.APP_VERSION
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(appVersion ? { [APP_VERSION_HEADER]: appVersion } : {}),
      ...(init.headers as Record<string, string> | undefined),
      'Accept-Language': language,
    },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const error = await res.json().catch(() => null) as Record<string, unknown> | null
    throw createApiClientError(res.status, error, `Failed with status ${res.status}`, res.headers.get('retry-after'))
  }
  const text = await res.text()
  if (!text) return null
  return parseResponseBody(text, schema, path)
}

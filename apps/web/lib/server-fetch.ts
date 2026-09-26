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

type ReadInit = Omit<RequestInit, 'method'> & { method?: 'GET' | 'HEAD' }

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

export async function serverAuthFetch<T = unknown>(
  path: string,
  init: ReadInit = {},
  schema?: ZodType<T>,
): Promise<T> {
  return fetchWithSession(path, init, schema, null)
}

export async function serverAuthMutate<T = unknown>(
  path: string,
  init: MutateInit,
  intendedAccountId: string | null,
  schema?: ZodType<T>,
): Promise<T> {
  return fetchWithSession(path, init, schema, intendedAccountId)
}

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

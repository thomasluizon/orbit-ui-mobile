import { resolveServerSession } from '@/lib/auth-api'
import { createApiClientError } from '@orbit/shared'
import { APP_VERSION_HEADER } from '@orbit/shared/utils'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

/**
 * Shared authenticated fetch for Server Actions.
 * Resolves the current session, forwards it as Bearer to the .NET API,
 * and throws a structured ApiClientError on failure.
 */
export async function serverAuthFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
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
  return JSON.parse(text) as T
}

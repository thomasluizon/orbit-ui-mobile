import { getAuthHeaders } from '@/lib/auth-api'
import { createApiClientError } from '@orbit/shared'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

/**
 * Shared authenticated fetch for Server Actions.
 * Reads the auth_token cookie, forwards it as Bearer to the .NET API,
 * and throws a structured ApiClientError on failure.
 */
export async function serverAuthFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => null) as Record<string, unknown> | null
    throw createApiClientError(res.status, error, `Failed with status ${res.status}`)
  }
  // 204 No Content returns no body
  if (res.status === 204) return null as T
  const text = await res.text()
  if (!text) return null as T
  return JSON.parse(text) as T
}

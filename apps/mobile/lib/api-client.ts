import { getToken, clearAllTokens } from './secure-store'
import { buildClientTimeZoneHeaders, createApiClientError } from '@orbit/shared'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: string | FormData | null
  headers?: Record<string, string>
}

interface ApiErrorPayload {
  error?: string
  message?: string
  requestId?: string
}

function getResponseHeader(
  response: Response,
  headerName: string,
): string | null {
  const headers = response.headers
  if (!headers || typeof headers.get !== 'function') {
    return null
  }

  return headers.get(headerName)
}

function attachRequestIdToPayload(
  payload: ApiErrorPayload | null,
  requestId: string | null,
): ApiErrorPayload | null {
  const trimmedRequestId = requestId?.trim()
  if (!trimmedRequestId) return payload
  if (payload) {
    return payload.requestId
      ? payload
      : {
          ...payload,
          requestId: trimmedRequestId,
        }
  }

  return {
    requestId: trimmedRequestId,
  }
}

export async function apiClient<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...buildClientTimeZoneHeaders(),
    ...(options.headers ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers } as RequestInit)

  if (res.status === 401) {
    await clearAllTokens()
    // Navigation to login handled by auth store listener
    throw createApiClientError(
      401,
      attachRequestIdToPayload(
        { error: 'Unauthorized' },
        getResponseHeader(res, 'x-orbit-request-id'),
      ),
      'Unauthorized',
    )
  }

  if (!res.ok) {
    const error = attachRequestIdToPayload(
      (await res.json().catch(() => null)) as ApiErrorPayload | null,
      getResponseHeader(res, 'x-orbit-request-id'),
    )
    throw createApiClientError(
      res.status,
      error,
      `Request failed: ${res.status}`,
    )
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text.trim()) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

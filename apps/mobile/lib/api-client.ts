import { getToken, clearAllTokens } from './secure-store'
import { buildClientTimeZoneHeaders, createApiClientError } from '@orbit/shared'
import { API } from '@orbit/shared/api'

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

type RequestExecution = {
  response: Response
  requestId: string | null
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

function buildRequestHeaders(
  token: string | null,
  options: ApiRequestOptions,
): Record<string, string> {
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

  return headers
}

async function executeRequest(
  path: string,
  options: ApiRequestOptions,
  tokenOverride?: string | null,
): Promise<RequestExecution> {
  const token = tokenOverride ?? await getToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildRequestHeaders(token, options),
  } as RequestInit)

  return {
    response,
    requestId: getResponseHeader(response, 'x-orbit-request-id'),
  }
}

function toUnauthorizedError(requestId: string | null): Error {
  return createApiClientError(
    401,
    attachRequestIdToPayload(
      { error: 'Unauthorized' },
      requestId,
    ),
    'Unauthorized',
  )
}

async function parseApiResponse<T>(
  response: Response,
  requestId: string | null,
): Promise<T> {
  if (!response.ok) {
    const error = attachRequestIdToPayload(
      (await response.json().catch(() => null)) as ApiErrorPayload | null,
      requestId,
    )
    throw createApiClientError(
      response.status,
      error,
      `Request failed: ${response.status}`,
    )
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  if (!text.trim()) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

export async function apiClient<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { response, requestId } = await executeRequest(path, options)

  if (response.status === 401 && path !== API.auth.refresh) {
    const { clearSessionAndResetAuth, refreshSessionToken } = await import('@/stores/auth-store')
    const refreshedToken = await refreshSessionToken({ clearOnFailure: false })

    if (refreshedToken) {
      const retry = await executeRequest(path, options, refreshedToken)
      if (retry.response.status !== 401) {
        return parseApiResponse<T>(retry.response, retry.requestId)
      }

      await clearSessionAndResetAuth()
      throw toUnauthorizedError(retry.requestId)
    }

    await clearSessionAndResetAuth()
    throw toUnauthorizedError(requestId)
  }

  if (response.status === 401) {
    await clearAllTokens()
    throw toUnauthorizedError(requestId)
  }

  return parseApiResponse<T>(response, requestId)
}

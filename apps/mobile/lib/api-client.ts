import { getToken, clearAllTokens } from './secure-store'
import { buildClientTimeZoneHeaders, createApiClientError } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { buildAppVersionHeaders } from './app-version'
import { consumePendingIdempotencyKey } from './idempotency-key'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: string | FormData | null
  headers?: Record<string, string>
  idempotencyKey?: string
}

interface ApiErrorPayload {
  error?: string
  message?: string
  requestId?: string
}

type RequestExecution = {
  response: Response
  requestId: string | null
  tokenUsed: string | null
}

function getResponseHeader(
  headers: { get?: (name: string) => string | null } | null | undefined,
  headerName: string,
): string | null {
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
    ...buildAppVersionHeaders(),
    ...(options.headers ?? {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
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
    requestId: getResponseHeader(response.headers, 'x-orbit-request-id'),
    tokenUsed: token,
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

async function handleUpgradeRequired<T>(
  response: Response,
  requestId: string | null,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (ApiErrorPayload & { minVersion?: unknown })
    | null
  const minVersion =
    typeof payload?.minVersion === 'string' ? payload.minVersion : null

  const { markUpgradeRequired } = await import('@/stores/version-gate-store')
  markUpgradeRequired(minVersion)

  throw createApiClientError(
    426,
    attachRequestIdToPayload(payload ?? { error: 'Upgrade required' }, requestId),
    'Upgrade required',
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

async function redirectToLogin(): Promise<void> {
  const { router } = await import('expo-router')
  router.replace('/login')
}

export async function apiClient<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const idempotencyKey = options.idempotencyKey ?? consumePendingIdempotencyKey() ?? undefined
  const effectiveOptions: ApiRequestOptions =
    idempotencyKey === undefined ? options : { ...options, idempotencyKey }

  const { response, requestId, tokenUsed } = await executeRequest(path, effectiveOptions)

  if (response.status === 426) {
    return handleUpgradeRequired<T>(response, requestId)
  }

  if (response.status === 401 && path !== API.auth.refresh) {
    const latestToken = await getToken()
    if (latestToken && latestToken !== tokenUsed) {
      const retryWithLatest = await executeRequest(path, effectiveOptions, latestToken)
      if (retryWithLatest.response.status !== 401) {
        return parseApiResponse<T>(retryWithLatest.response, retryWithLatest.requestId)
      }
    }

    const { clearSessionAndResetAuth, refreshSession, isAuthTransitionInFlight } =
      await import('@/stores/auth-store')
    const refreshOutcome = await refreshSession({ clearOnFailure: false })

    if (refreshOutcome.status === 'refreshed') {
      const retry = await executeRequest(path, effectiveOptions, refreshOutcome.token)
      if (retry.response.status !== 401) {
        return parseApiResponse<T>(retry.response, retry.requestId)
      }

      if (!isAuthTransitionInFlight()) {
        await clearSessionAndResetAuth()
        await redirectToLogin()
      }
      throw toUnauthorizedError(retry.requestId)
    }

    if (refreshOutcome.status === 'unauthorized' && !isAuthTransitionInFlight()) {
      await clearSessionAndResetAuth()
      await redirectToLogin()
    }
    throw toUnauthorizedError(requestId)
  }

  if (response.status === 401) {
    await clearAllTokens()
    throw toUnauthorizedError(requestId)
  }

  return parseApiResponse<T>(response, requestId)
}

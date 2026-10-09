import { i18n } from './i18n'
import { useThrottleStore } from '@/stores/throttle-store'
import { getToken } from './secure-store'
import { buildClientTimeZoneHeaders, createApiClientError, validateApiResponse } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { buildAppVersionHeaders } from './app-version'
import { consumePendingIdempotencyKey } from './idempotency-key'
import { getAccountEventOrigin } from './account-event-origin'
import { API_BASE } from './api-base'
import type { ZodType } from 'zod'

type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: string | FormData | null
  headers?: Record<string, string>
  idempotencyKey?: string
  skipAuthRecovery?: boolean
  isCurrent?: () => boolean
}

interface ApiErrorPayload {
  error?: string
  message?: string
  requestId?: string
}

class AuthRefreshNetworkError extends TypeError {
  constructor() {
    super('Network request failed')
    this.name = 'AuthRefreshNetworkError'
  }
}

type RequestExecution = {
  response: Response
  requestId: string | null
  tokenUsed: string | null
}

/**
 * A parsed response together with the token the API accepted for it. `executeRequest` reads
 * the store again at request time, and the 401 path retries under a rotated or refreshed
 * token, so the credential that authorised the body can differ from the one the caller last
 * saw.
 */
export interface AuthorizedApiResponse<T> {
  data: T
  authorizingToken: string | null
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
    ...options.headers,
    'Accept-Language': i18n.language,
  }

  const method = options.method?.toUpperCase() ?? 'GET'
  const eventOrigin = getAccountEventOrigin()
  if (eventOrigin && method !== 'GET' && method !== 'HEAD') {
    headers['X-Orbit-Event-Origin'] = eventOrigin
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
  if (options.isCurrent?.() === false) throw new Error('Account changed')
  const requestOptions = { ...options }
  delete requestOptions.skipAuthRecovery
  delete requestOptions.isCurrent
  const response = await fetch(`${API_BASE}${path}`, {
    ...requestOptions,
    headers: buildRequestHeaders(token, options),
  })

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
  path: string,
  schema?: ZodType<T>,
  method = 'GET',
): Promise<T> {
  if (!response.ok) {
    const error = attachRequestIdToPayload(
      (await response.json().catch(() => null)) as ApiErrorPayload | null,
      requestId,
    )
    const failure = createApiClientError(response.status, error, `Request failed: ${response.status}`, getResponseHeader(response.headers, 'retry-after'))
    if (!['GET', 'HEAD'].includes(method.toUpperCase())) useThrottleStore.getState().show(response.status, error)
    throw failure
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  if (!text.trim()) {
    return undefined as T
  }

  return validateApiResponse(JSON.parse(text), schema, path)
}

async function redirectToLogin(): Promise<void> {
  const { router } = await import('expo-router')
  router.replace('/login')
}

async function clearObservedSessionAndRedirect(generation: {
  epoch: number
  credentialVersion: number
}): Promise<void> {
  const { clearSessionAndResetAuth } = await import('@/stores/auth-store')
  const cleared = await clearSessionAndResetAuth({
    authority: 'observed-credential',
    ...generation,
  })
  if (cleared) await redirectToLogin()
}

async function handleUnauthorized<T>(
  path: string,
  effectiveOptions: ApiRequestOptions,
  requestId: string | null,
  tokenUsed: string | null,
  schema: ZodType<T> | undefined,
): Promise<AuthorizedApiResponse<T>> {
  const latestToken = await getToken()
  if (latestToken && latestToken !== tokenUsed) {
    const retryWithLatest = await executeRequest(path, effectiveOptions, latestToken)
    if (retryWithLatest.response.status !== 401) {
      return {
        data: await parseApiResponse<T>(
          retryWithLatest.response,
          retryWithLatest.requestId,
          path,
          schema,
          effectiveOptions.method,
        ),
        authorizingToken: retryWithLatest.tokenUsed,
      }
    }
  }

  const {
    getSessionGeneration,
    refreshSession,
    isAuthTransitionInFlight,
  } =
    await import('@/stores/auth-store')
  const refreshOutcome = await refreshSession()

  switch (refreshOutcome.status) {
    case 'network-error':
      throw new AuthRefreshNetworkError()
    case 'refreshed': {
      const refreshedGeneration = getSessionGeneration()
      const retry = await executeRequest(path, effectiveOptions, refreshOutcome.token)
      if (retry.response.status !== 401) {
        return {
          data: await parseApiResponse<T>(retry.response, retry.requestId, path, schema, effectiveOptions.method),
          authorizingToken: retry.tokenUsed,
        }
      }

      if (!isAuthTransitionInFlight()) {
        await clearObservedSessionAndRedirect(refreshedGeneration)
      }
      throw toUnauthorizedError(retry.requestId)
    }
    case 'superseded':
      throw toUnauthorizedError(requestId)
    case 'unauthorized':
      throw toUnauthorizedError(requestId)
  }
}

/**
 * Authenticated fetch for the mobile app. Attaches the bearer token, time-zone and app-version
 * headers, transparently refreshes/retries on a 401, and surfaces upgrade-required (426) gating.
 * When a Zod `schema` is supplied the response body is validated at the trust boundary and a typed
 * `ApiClientError` (502, `INVALID_RESPONSE_SCHEMA`) is thrown if it does not match the contract.
 */
export async function apiClient<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
  schema?: ZodType<T>,
): Promise<T> {
  return (await apiClientWithAuthorizingToken<T>(path, options, schema)).data
}

/**
 * Use it only where the ANSWER has to be attributed to an account: the Android widget cache
 * tags each payload with the account that produced it, and tagging with the caller's
 * pre-request token would mislabel a body the 401 path fetched under a different one.
 */
export async function apiClientWithAuthorizingToken<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
  schema?: ZodType<T>,
): Promise<AuthorizedApiResponse<T>> {
  const idempotencyKey = options.idempotencyKey ?? consumePendingIdempotencyKey() ?? undefined
  const effectiveOptions: ApiRequestOptions =
    idempotencyKey === undefined ? options : { ...options, idempotencyKey }

  const { getSessionGeneration } = await import('@/stores/auth-store')
  const observedGeneration = getSessionGeneration()
  const { response, requestId, tokenUsed } = await executeRequest(path, effectiveOptions)

  if (response.status === 426) {
    return handleUpgradeRequired<AuthorizedApiResponse<T>>(response, requestId)
  }

  if (response.status === 401 && effectiveOptions.skipAuthRecovery) {
    throw toUnauthorizedError(requestId)
  }

  if (response.status === 401 && tokenUsed === null) {
    const latestToken = await getToken()
    const { useAuthStore } = await import('@/stores/auth-store')
    if (!latestToken && !useAuthStore.getState().isAuthenticated) {
      return {
        data: await parseApiResponse<T>(response, requestId, path, schema, effectiveOptions.method),
        authorizingToken: null,
      }
    }
  }

  if (response.status === 401 && path !== API.auth.refresh) {
    return handleUnauthorized<T>(path, effectiveOptions, requestId, tokenUsed, schema)
  }

  if (response.status === 401) {
    const { clearSessionAndResetAuth } = await import('@/stores/auth-store')
    await clearSessionAndResetAuth({
      authority: 'observed-credential',
      ...observedGeneration,
    })
    throw toUnauthorizedError(requestId)
  }

  return {
    data: await parseApiResponse<T>(response, requestId, path, schema, effectiveOptions.method),
    authorizingToken: tokenUsed,
  }
}

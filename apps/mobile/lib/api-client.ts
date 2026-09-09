import { useThrottleStore } from '@/stores/throttle-store'
import { getToken, clearAllTokens } from './secure-store'
import { buildClientTimeZoneHeaders, createApiClientError, validateApiResponse } from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { buildAppVersionHeaders } from './app-version'
import { consumePendingIdempotencyKey } from './idempotency-key'
import type { ZodType } from 'zod'

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

/**
 * A parsed response together with the token the API accepted for it.
 *
 * The caller's own `getToken()` does not answer this. `executeRequest` reads the store again at
 * request time, and the 401 path retries under a rotated or refreshed token, so the credential that
 * authorised the body can differ from the one the caller last saw. Anything that records WHOSE data
 * it received has to read it from here.
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
): Promise<T> {
  if (!response.ok) {
    const error = attachRequestIdToPayload(
      (await response.json().catch(() => null)) as ApiErrorPayload | null,
      requestId,
    )
    const failure = createApiClientError(response.status, error, `Request failed: ${response.status}`)
    useThrottleStore.getState().show(response.status, error)
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
        ),
        authorizingToken: retryWithLatest.tokenUsed,
      }
    }
  }

  const { clearSessionAndResetAuth, refreshSession, isAuthTransitionInFlight } =
    await import('@/stores/auth-store')
  const refreshOutcome = await refreshSession({ clearOnFailure: false })

  if (refreshOutcome.status === 'network-error') {
    throw new TypeError('Network request failed')
  }

  if (refreshOutcome.status === 'refreshed') {
    const retry = await executeRequest(path, effectiveOptions, refreshOutcome.token)
    if (retry.response.status !== 401) {
      return {
        data: await parseApiResponse<T>(retry.response, retry.requestId, path, schema),
        authorizingToken: retry.tokenUsed,
      }
    }

    if (!isAuthTransitionInFlight()) {
      await clearSessionAndResetAuth()
      await redirectToLogin()
    }
    throw toUnauthorizedError(retry.requestId)
  }

  if (!isAuthTransitionInFlight()) {
    await clearSessionAndResetAuth()
    await redirectToLogin()
  }
  throw toUnauthorizedError(requestId)
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
 * `apiClient`, plus the token the API accepted for this response.
 *
 * Use it only where the ANSWER has to be attributed to an account: the Android widget cache tags
 * each payload with the account that produced it, and tagging with the caller's pre-request token
 * would mislabel a body the 401 path fetched under a different one.
 */
export async function apiClientWithAuthorizingToken<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
  schema?: ZodType<T>,
): Promise<AuthorizedApiResponse<T>> {
  const idempotencyKey = options.idempotencyKey ?? consumePendingIdempotencyKey() ?? undefined
  const effectiveOptions: ApiRequestOptions =
    idempotencyKey === undefined ? options : { ...options, idempotencyKey }

  const { response, requestId, tokenUsed } = await executeRequest(path, effectiveOptions)

  if (response.status === 426) {
    return handleUpgradeRequired<AuthorizedApiResponse<T>>(response, requestId)
  }

  if (response.status === 401 && path !== API.auth.refresh) {
    return handleUnauthorized<T>(path, effectiveOptions, requestId, tokenUsed, schema)
  }

  if (response.status === 401) {
    await clearAllTokens()
    throw toUnauthorizedError(requestId)
  }

  return {
    data: await parseApiResponse<T>(response, requestId, path, schema),
    authorizingToken: tokenUsed,
  }
}

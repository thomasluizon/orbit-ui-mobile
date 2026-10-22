import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { applySessionRefreshFailure, fetchWithUpgradeGuidance } from '@/lib/api-fetch'
import { getAccountEventOrigin } from '@/lib/account-event-origin'
import { useThrottleStore } from '@/stores/throttle-store'
import type { useRouter } from 'next/navigation'
import type { useTranslations } from 'next-intl'
import {
  extractAuthBackendMessage,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import type { LoginResponse } from '@orbit/shared/types/auth'
import { withCookieSettingLogin } from '@/stores/auth-store'

class AuthFetchError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`Auth request failed with status ${status}`)
    this.name = 'AuthFetchError'
    this.status = status
    this.body = body
  }
}

interface AuthErrorState {
  message: string
  key: string
}

export function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  const value = match?.[1]
  return value === undefined ? undefined : decodeURIComponent(value)
}

export function isAuthFetchError(err: unknown): err is AuthFetchError {
  return (
    !!err &&
    typeof err === 'object' &&
    typeof (err as { status?: unknown }).status === 'number'
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function mergeRequestIdIntoBody(body: unknown, requestId: string | null): unknown {
  const trimmedRequestId = requestId?.trim()
  if (!trimmedRequestId) return body
  if (isRecord(body) && typeof body.requestId !== 'string') {
    return {
      ...body,
      requestId: trimmedRequestId,
    }
  }

  if (body === null) {
    return { requestId: trimmedRequestId }
  }

  return body
}

export function resolveLoginErrorState(
  err: unknown,
  t: ReturnType<typeof useTranslations>,
  source: 'google' | 'magic-code' | 'send' = 'magic-code',
): AuthErrorState {
  const status = isAuthFetchError(err) ? err.status : undefined
  const body = isAuthFetchError(err) ? err.body : err
  const backendMessage = extractAuthBackendMessage(body)
  const key = resolveAuthLoginErrorKey({ status, backendMessage, raw: err, source })

  return { key, message: t(key) }
}

interface AuthRequestAttempt {
  signal: AbortSignal
  isCurrent: () => boolean
  onSuccess: (response: unknown) => Promise<void>
}

async function fetchCodeVerification(init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  const origin = getAccountEventOrigin()
  if (origin) headers.set('X-Orbit-Event-Origin', origin)
  const response = await fetchWithUpgradeGuidance('/api/auth/verify-code', { ...init, headers })
  if (!response.ok) await applySessionRefreshFailure(response)
  if (response.status === 429) {
    const payload: unknown = await response.clone().json().catch(() => null)
    useThrottleStore.getState().show(response.status, payload)
  }
  return response
}

export async function fetchAuthEndpoint(
  url: string,
  body: Record<string, unknown>,
  attempt?: AuthRequestAttempt,
): Promise<unknown> {
  const request = async () => {
    if (attempt && !attempt.isCurrent()) throw new Error('Authentication attempt changed')
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': typeof body.language === 'string' ? body.language : 'en' },
      body: JSON.stringify(body),
      ...(attempt ? { signal: attempt.signal } : {}),
    }
    const response = url === '/api/auth/verify-code'
      ? await fetchCodeVerification(init)
      : await fetchWithThrottle(url, init)
    const payload: unknown = await response.json().catch(() => null)
    if (attempt && (!attempt.isCurrent() || attempt.signal.aborted)) throw new Error('Authentication attempt changed')
    if (!response.ok) throw new AuthFetchError(response.status, mergeRequestIdIntoBody(payload, response.headers.get('x-orbit-request-id')))
    if (attempt) await attempt.onSuccess(payload)
    return payload
  }
  return url === '/api/auth/verify-code' ? withCookieSettingLogin(request) : request()
}

export async function handleVerifySuccess(
  loginResponse: LoginResponse,
  referralCode: string | undefined,
  setAuth: (lr: LoginResponse) => void,
  router: ReturnType<typeof useRouter>,
  getReturnUrl: () => string,
  isCurrent: () => boolean = () => true,
) {
  if (!isCurrent()) return
  setAuth(loginResponse)
  await hydrateProfilePresentation()
  if (!isCurrent()) return
  if (referralCode) {
    document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
  }
  setRouteTransitionIntent('replace')
  router.push(getReturnUrl())
}

export function isOfflinePreflight(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

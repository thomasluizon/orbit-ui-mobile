import type { useRouter } from 'next/navigation'
import type { useTranslations } from 'next-intl'
import {
  extractAuthBackendMessage,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import type { LoginResponse } from '@orbit/shared/types/auth'

interface AuthFetchError {
  status: number
  body: unknown
}

interface AuthErrorState {
  message: string
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
  source: 'google' | 'magic-code' = 'magic-code',
): AuthErrorState {
  const status = isAuthFetchError(err) ? err.status : undefined
  const body = isAuthFetchError(err) ? err.body : err
  const backendMessage = extractAuthBackendMessage(body)
  const key = resolveAuthLoginErrorKey({ status, backendMessage, raw: err, source })

  return { message: t(key) }
}

export async function fetchAuthEndpoint(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const err: AuthFetchError = {
      status: response.status,
      body: mergeRequestIdIntoBody(data, response.headers.get('x-orbit-request-id')),
    }
    throw err
  }
  return response.json()
}

export async function handleVerifySuccess(
  loginResponse: LoginResponse,
  referralCode: string | undefined,
  setAuth: (lr: LoginResponse) => void,
  setSuccessMessage: (msg: string | null) => void,
  t: ReturnType<typeof useTranslations>,
  router: ReturnType<typeof useRouter>,
  getReturnUrl: () => string,
) {
  setAuth(loginResponse)
  await hydrateProfilePresentation()
  if (referralCode) {
    localStorage.setItem('orbit_referral_applied', '1')
    document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
  }
  if (loginResponse.wasReactivated) {
    setSuccessMessage(t('profile.deleteAccount.reactivated'))
  }
  setRouteTransitionIntent('replace')
  router.push(getReturnUrl())
}

export function isOfflinePreflight(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

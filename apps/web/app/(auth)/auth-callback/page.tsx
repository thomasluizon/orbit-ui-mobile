'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import {
  extractAuthBackendMessage,
  extractBackendRequestId,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { useAuthStore } from '@/stores/auth-store'
import { getSupabaseClient } from '@/lib/supabase'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import type { LoginResponse } from '@orbit/shared/types/auth'

function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  const value = match?.[1]
  return value === undefined ? undefined : decodeURIComponent(value)
}

interface AuthFetchError {
  status: number
  body: unknown
}

interface AuthCallbackErrorState {
  message: string
  requestId?: string
}

function isAuthFetchError(err: unknown): err is AuthFetchError {
  return (
    !!err &&
    typeof err === 'object' &&
    typeof (err as { status?: unknown }).status === 'number'
  )
}

function resolveAuthCallbackError(
  err: unknown,
  t: ReturnType<typeof useTranslations>,
): AuthCallbackErrorState {
  const status = isAuthFetchError(err) ? err.status : undefined
  const body = isAuthFetchError(err) ? err.body : err
  const backendMessage = extractAuthBackendMessage(body)
  const requestId = extractBackendRequestId(body)
  const hasStructuredContext =
    status !== undefined ||
    backendMessage !== undefined ||
    requestId !== undefined ||
    err instanceof TypeError

  if (!hasStructuredContext) {
    return {
      message: t('auth.callbackError'),
      requestId,
    }
  }

  const key = resolveAuthLoginErrorKey({
    status,
    backendMessage,
    raw: err,
    source: 'google',
  })

  return {
    message: t(key),
    requestId,
  }
}

export default function AuthCallbackPage() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()
  const [errorState, setErrorState] = useState<AuthCallbackErrorState | null>(null)
  const processedRef = useRef(false)
  const isAuthenticatedRef = useRef(false)
  const errorMessageRef = useRef<string | null>(null)

  useEffect(() => {
    if (processedRef.current) return
    processedRef.current = true

    // Extract provider tokens before Supabase client consumes them.
    // Web: tokens are in the URL hash (implicit flow).
    let extractedProviderToken: string | undefined
    let extractedProviderRefreshToken: string | undefined

    if (globalThis.location.hash) {
      const hashParams = new URLSearchParams(globalThis.location.hash.substring(1))
      extractedProviderToken = hashParams.get('provider_token') ?? undefined
      extractedProviderRefreshToken = hashParams.get('provider_refresh_token') ?? undefined
    }
    const query = new URLSearchParams(globalThis.location.search)
    extractedProviderToken ??= query.get('provider_token') ?? undefined
    extractedProviderRefreshToken ??= query.get('provider_refresh_token') ?? undefined

    const supabase = getSupabaseClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return
      if (!session) return

      subscription.unsubscribe()

      try {
        const referralCode = getCookieValue('referral_code')

        const response = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: session.access_token,
            language: locale,
            googleAccessToken: extractedProviderToken ?? session.provider_token ?? undefined,
            googleRefreshToken: extractedProviderRefreshToken ?? session.provider_refresh_token ?? undefined,
            ...(referralCode ? { referralCode } : {}),
          }),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null)
          const nextErrorState = resolveAuthCallbackError(
            {
              status: response.status,
              body: errorBody,
            },
            t,
          )
          console.error('[auth-callback] google exchange failed', {
            status: response.status,
            requestId: nextErrorState.requestId,
            error: extractAuthBackendMessage(errorBody),
          })
          setErrorState(nextErrorState)
          errorMessageRef.current = nextErrorState.message
          return
        }

        const loginResponse = (await response.json()) as LoginResponse
        setAuth(loginResponse)
        isAuthenticatedRef.current = true
        await hydrateProfilePresentation()

        // Handle referral
        if (referralCode) {
          localStorage.setItem('orbit_referral_applied', '1')
          document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
        }

        // Navigate to return URL or home
        const storedReturn = sessionStorage.getItem('auth_return_url')
        sessionStorage.removeItem('auth_return_url')
        const returnUrl = searchParams.get('returnUrl') ?? storedReturn ?? undefined
        const safeUrl =
          returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
            ? returnUrl
            : '/'
        router.push(safeUrl)
      } catch (error: unknown) {
        const nextErrorState = resolveAuthCallbackError(error, t)
        console.error('[auth-callback] unexpected callback error', {
          requestId: nextErrorState.requestId,
          error,
        })
        setErrorState(nextErrorState)
        errorMessageRef.current = nextErrorState.message
      }
    })

    // 15s timeout -- uses refs to avoid stale closure
    const timeoutId = setTimeout(() => {
      subscription.unsubscribe()
      if (!isAuthenticatedRef.current && !errorMessageRef.current) {
        const nextErrorState = {
          message: t('auth.callbackError'),
        }
        setErrorState(nextErrorState)
        errorMessageRef.current = nextErrorState.message
      }
    }, 15000)

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-sm">
      <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-6 space-y-6 border border-border text-center">
        {errorState ? (
          <>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 text-sm text-red-400">
              <p>{errorState.message}</p>
              {errorState.requestId ? (
                <p className="mt-2 text-xs text-red-300">
                  {t('auth.errorReference', { requestId: errorState.requestId })}
                </p>
              ) : null}
            </div>
            <Link
              href="/login"
              className="text-primary hover:underline font-semibold text-sm"
            >
              {t('auth.backToLogin')}
            </Link>
          </>
        ) : (
          <>
            <svg className="size-8 animate-spin text-primary mx-auto" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-text-secondary text-sm">{t('auth.signingIn')}</p>
          </>
        )}
      </div>
    </div>
  )
}

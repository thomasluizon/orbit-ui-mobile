'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import type { LoginResponse } from '@orbit/shared/types/auth'

// TODO: Replace with next-intl when i18n is wired up
const t = (key: string) => {
  const strings: Record<string, string> = {
    'auth.signingIn': 'Signing you in...',
    'auth.callbackError': 'Authentication failed. Please try again.',
    'auth.backToLogin': 'Back to login',
  }
  return strings[key] ?? key
}

function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  const value = match?.[1]
  return value !== undefined ? decodeURIComponent(value) : undefined
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth, isAuthenticated } = useAuthStore()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const processedRef = useRef(false)

  useEffect(() => {
    if (processedRef.current) return
    processedRef.current = true

    async function handleCallback() {
      // Extract provider tokens from URL hash (Supabase implicit flow)
      // and from query params (fallback)
      let providerToken: string | undefined
      let providerRefreshToken: string | undefined
      let accessToken: string | undefined

      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        providerToken = hashParams.get('provider_token') ?? undefined
        providerRefreshToken = hashParams.get('provider_refresh_token') ?? undefined
        accessToken = hashParams.get('access_token') ?? undefined
      }

      // Also check query params as fallback
      providerToken ??= searchParams.get('provider_token') ?? undefined
      providerRefreshToken ??= searchParams.get('provider_refresh_token') ?? undefined
      accessToken ??= searchParams.get('access_token') ?? undefined

      // Supabase PKCE flow: code is in query params, exchange via Supabase client
      const code = searchParams.get('code')

      if (!accessToken && !code) {
        // No tokens at all -- something went wrong
        setErrorMessage(t('auth.callbackError'))
        return
      }

      // If we have a code but no access_token, we need to exchange it.
      // For PKCE flow, exchange code for session via Supabase.
      if (code && !accessToken) {
        try {
          // Exchange code for access token via Supabase REST API
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

          if (!supabaseUrl || !supabaseKey) {
            setErrorMessage(t('auth.callbackError'))
            return
          }

          const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
            },
            body: JSON.stringify({
              auth_code: code,
              code_verifier: sessionStorage.getItem('supabase-code-verifier') ?? '',
            }),
          })

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json()
            accessToken = tokenData.access_token
            providerToken ??= tokenData.provider_token
            providerRefreshToken ??= tokenData.provider_refresh_token
          } else {
            setErrorMessage(t('auth.callbackError'))
            return
          }
        } catch {
          setErrorMessage(t('auth.callbackError'))
          return
        }
      }

      if (!accessToken) {
        setErrorMessage(t('auth.callbackError'))
        return
      }

      // Exchange Supabase token for our app token via BFF
      const referralCode = getCookieValue('referral_code')

      try {
        const response = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            language: 'en',
            googleAccessToken: providerToken,
            googleRefreshToken: providerRefreshToken,
            ...(referralCode ? { referralCode } : {}),
          }),
        })

        if (!response.ok) {
          setErrorMessage(t('auth.callbackError'))
          return
        }

        const loginResponse = (await response.json()) as LoginResponse
        setAuth(loginResponse)

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
      } catch {
        setErrorMessage(t('auth.callbackError'))
      }
    }

    handleCallback()

    // 15s timeout for OAuth callback
    const timeoutId = setTimeout(() => {
      if (!isAuthenticated && !errorMessage) {
        setErrorMessage(t('auth.callbackError'))
      }
    }, 15000)

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-sm">
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6 text-center">
        {errorMessage ? (
          <>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </div>
            <a
              href="/login"
              className="text-primary hover:underline font-semibold text-sm"
            >
              {t('auth.backToLogin')}
            </a>
          </>
        ) : (
          <>
            <svg className="size-8 animate-spin text-primary mx-auto" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-muted-foreground text-sm">{t('auth.signingIn')}</p>
          </>
        )}
      </div>
    </div>
  )
}

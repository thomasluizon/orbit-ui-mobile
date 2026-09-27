'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import type { LoginResponse } from '@orbit/shared/types/auth'

function getCookieValue(name: string): string | undefined {
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1])
}

function AuthCallbackContent() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const setAuth = useAuthStore((store) => store.setAuth)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true
    const params = new URLSearchParams(globalThis.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (params.has('error') || !code || !state) {
      void fetch('/api/auth/google/code', { method: 'DELETE' })
        .then(() => router.replace('/login?googleError=1'), () => router.replace('/login?googleError=1'))
      return
    }

    async function complete() {
      const referralCode = getCookieValue('referral_code')
      const response = await withCookieSettingLogin(() => fetch('/api/auth/google/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state, language: locale, ...(referralCode ? { referralCode } : {}) }),
      }))
      if (!response.ok) throw new Error('Google sign-in failed')
      setAuth((await response.json()) as LoginResponse)
      await hydrateProfilePresentation()
      if (referralCode) {
        localStorage.setItem('orbit_referral_applied', '1')
        document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
      }
      const storedReturn = sessionStorage.getItem('auth_return_url')
      sessionStorage.removeItem('auth_return_url')
      const safeReturn = storedReturn?.startsWith('/') && !storedReturn.startsWith('//')
        ? storedReturn : '/'
      router.push(safeReturn)
    }
    void complete().catch(() => router.replace('/login?googleError=1'))
  }, [locale, router, setAuth])

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center" style={{ gap: 20 }}>
        <svg className="size-8 animate-spin text-[var(--primary)]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.02em', color: 'var(--fg-3)', margin: 0 }}>
          {t('auth.signingIn')}
        </p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return <Suspense fallback={null}><AuthCallbackContent /></Suspense>
}

'use client'

import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import type { Session } from '@supabase/supabase-js'
import { useAuthStore } from '@/stores/auth-store'
import { getSupabaseClient } from '@/lib/supabase'
import { LoginContent } from '../login/login-content'
import { getCookieValue, handleVerifySuccess } from '../login/login-form-helpers'
import type { LoginResponse } from '@orbit/shared/types/auth'

export default function AuthCallbackPage() {
  return <Suspense fallback={null}><AuthCallbackContent /></Suspense>
}

function AuthCallbackContent() {
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuthStore()
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [accountBack, setAccountBack] = useState<LoginResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const processing = useRef(false)
  const completed = useRef(false)
  const failed = useRef(false)

  useEffect(() => {
    const query = new URLSearchParams(globalThis.location.search)
    const hash = new URLSearchParams(globalThis.location.hash.substring(1))
    const supabase = getSupabaseClient()
    async function exchange(session: Session) {
      try {
        const referralCode = getCookieValue('referral_code')
        const response = await fetchWithThrottle('/api/auth/google', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: session.access_token, language: locale,
            googleAccessToken: hash.get('provider_token') ?? query.get('provider_token') ?? session.provider_token ?? undefined,
            googleRefreshToken: hash.get('provider_refresh_token') ?? query.get('provider_refresh_token') ?? session.provider_refresh_token ?? undefined,
            ...(referralCode ? { referralCode } : {}),
          }),
        })
        if (!response.ok) { failed.current = true; setState('failed'); return }
        const loginResponse = await response.json() as LoginResponse
        completed.current = true
        if (loginResponse.wasReactivated) { setAccountBack(loginResponse); setState('account'); return }
        const storedReturn = sessionStorage.getItem('auth_return_url')
        sessionStorage.removeItem('auth_return_url')
        const url = searchParams.get('returnUrl') ?? storedReturn
        const safeUrl = url && url.startsWith('/') && !url.startsWith('//') ? url : '/'
        await handleVerifySuccess(loginResponse, referralCode, setAuth, router, () => safeUrl)
      } catch { failed.current = true; setState('failed') }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') || !session || processing.current) return
      processing.current = true
      void exchange(session)
    })
    const timeout = setTimeout(() => {
      if (!completed.current && !failed.current) { failed.current = true; setState('failed') }
      subscription.unsubscribe()
    }, 15_000)
    return () => { clearTimeout(timeout); subscription.unsubscribe() }
  }, [locale, router, searchParams, setAuth])

  async function continueAccount() {
    if (!accountBack || loading) return
    setLoading(true)
    try {
      sessionStorage.removeItem('auth_return_url')
      await handleVerifySuccess(accountBack, getCookieValue('referral_code'), setAuth, router, () => '/')
    } catch { setState('failed') }
    finally { setLoading(false) }
  }

  return <LoginContent callback={{ state, onContinue: () => void continueAccount(), loading }} />
}

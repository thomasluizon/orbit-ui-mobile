'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { LoginContent } from '../login/login-content'
import { getCookieValue, handleVerifySuccess } from '../login/login-form-helpers'
import type { LoginResponse } from '@orbit/shared/types/auth'

export default function AuthCallbackPage() {
  return <Suspense fallback={null}><AuthCallbackContent /></Suspense>
}

function AuthCallbackContent() {
  const locale = useLocale()
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [accountBack, setAccountBack] = useState<LoginResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true
    const params = new URLSearchParams(globalThis.location.search)
    const code = params.get('code')
    const oauthState = params.get('state')
    if (params.has('error') || !code || !oauthState) {
      if (oauthState) {
        void fetch(`/api/auth/google/code?state=${encodeURIComponent(oauthState)}`, { method: 'DELETE' })
          .then(() => setState('failed'), () => setState('failed'))
      } else queueMicrotask(() => setState('failed'))
      return
    }

    async function complete() {
      const generation = getAccountGeneration()
      const referralCode = getCookieValue('referral_code')
      const response = await withCookieSettingLogin(() => fetch('/api/auth/google/code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state: oauthState, language: locale,
          ...(referralCode ? { referralCode } : {}) }),
      }))
      if (!response.ok || generation !== getAccountGeneration()) throw new Error('Google sign-in failed')
      const loginResponse = await response.json() as LoginResponse
      if (loginResponse.wasReactivated) {
        setAccountBack(loginResponse)
        setState('account')
        return
      }
      const storedReturn = sessionStorage.getItem('auth_return_url')
      sessionStorage.removeItem('auth_return_url')
      const safeUrl = storedReturn?.startsWith('/') && !storedReturn.startsWith('//') ? storedReturn : '/'
      await handleVerifySuccess(loginResponse, referralCode, setAuth, router, () => safeUrl)
    }
    void complete().catch(() => setState('failed'))
  }, [locale, router, setAuth])

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

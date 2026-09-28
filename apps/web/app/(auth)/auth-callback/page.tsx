'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { LoginContent } from '../login/login-content'
import { getCookieValue } from '../login/login-form-helpers'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
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
  const accountBackGeneration = useRef<number | null>(null)
  const [loading, setLoading] = useState(false)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true
    const params = new URLSearchParams(globalThis.location.search)
    const code = params.get('code')
    const oauthState = params.get('state')
    if (params.has('error') || !code || !oauthState) {
      const storedReturn = sessionStorage.getItem('auth_return_url')
      const calendarReturn = storedReturn === '/calendar-sync' || storedReturn === '/calendar-sync?mode=review'
      const cancelled = ['access_denied', 'cancel', 'dismiss'].includes(params.get('error') ?? '')
      const finish = () => {
        if (storedReturn && calendarReturn && cancelled) router.replace(storedReturn)
        else setState('failed')
      }
      if (oauthState) {
        void fetch(`/api/auth/google/code?state=${encodeURIComponent(oauthState)}`, { method: 'DELETE' })
          .then(finish, finish)
      } else queueMicrotask(finish)
      return
    }

    let ownedGeneration = getAccountGeneration()
    async function complete() {
      const referralCode = getCookieValue('referral_code')
      const generation = ownedGeneration
      const loginResponse = await withCookieSettingLogin(async () => {
        if (generation !== getAccountGeneration()) throw new Error('Authentication session changed')
        const response = await fetch('/api/auth/google/code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state: oauthState, language: locale,
            ...(referralCode ? { referralCode } : {}) }),
        })
        if (!response.ok || generation !== getAccountGeneration()) throw new Error('Google sign-in failed')
        const result = await response.json() as LoginResponse
        if (generation !== getAccountGeneration()) throw new Error('Authentication session changed')
        if (!result.wasReactivated) {
          setAuth(result)
          ownedGeneration = getAccountGeneration()
        }
        return result
      })
      if (loginResponse.wasReactivated) {
        if (generation !== getAccountGeneration()) return
        accountBackGeneration.current = generation
        setAccountBack(loginResponse)
        setState('account')
        return
      }
      await hydrateProfilePresentation()
      if (ownedGeneration !== getAccountGeneration()) return
      if (referralCode) {
        document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
      }
      const storedReturn = sessionStorage.getItem('auth_return_url')
      sessionStorage.removeItem('auth_return_url')
      const safeUrl = storedReturn?.startsWith('/') && !storedReturn.startsWith('//') ? storedReturn : '/'
      setRouteTransitionIntent('replace')
      router.push(safeUrl)
    }
    void complete().catch(() => {
      if (ownedGeneration === getAccountGeneration()) setState('failed')
    })
  }, [locale, router, setAuth])

  async function continueAccount() {
    const expectedGeneration = accountBackGeneration.current
    if (!accountBack || loading || expectedGeneration === null
      || expectedGeneration !== getAccountGeneration()) return
    setLoading(true)
    let ownedGeneration = expectedGeneration
    try {
      setAuth(accountBack)
      ownedGeneration = getAccountGeneration()
      await hydrateProfilePresentation()
      if (ownedGeneration !== getAccountGeneration()) return
      sessionStorage.removeItem('auth_return_url')
      if (getCookieValue('referral_code')) {
        document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
      }
      setRouteTransitionIntent('replace')
      router.push('/')
    } catch {
      if (ownedGeneration === getAccountGeneration()) setState('failed')
    }
    finally { setLoading(false) }
  }

  return <LoginContent callback={{ state, onContinue: () => void continueAccount(), loading }} />
}

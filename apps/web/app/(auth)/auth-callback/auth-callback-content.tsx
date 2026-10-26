'use client'

import { API } from '@orbit/shared/api'
import { AuthCallbackError, createAuthCallbackFailureReporter, readAuthCallbackInput, type AuthCallbackFailureReason } from '@orbit/shared/utils/auth-callback-failure'
import { captureMessage } from '@sentry/nextjs'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { fetchWithUpgradeGuidance } from '@/lib/api-fetch'
import { getAccountGeneration } from '@/lib/session-epoch'
import { LoginContent } from '../login/login-content'
import { getCookieValue } from '../login/login-form-helpers'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { Lockup } from '@/components/ui/lockup'
import { PillLink } from '@/components/ui/pill-button'
import { getGoogleAuthAppIntent } from '@/lib/google-auth-app-intent'
import type { LoginResponse } from '@orbit/shared/types/auth'

export function AuthCallbackContent({ pendingWebState }: Readonly<{ pendingWebState: string | null }>) {
  const locale = useLocale()
  const t = useTranslations()
  const [appIntent, setAppIntent] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [params] = useState(() => new URLSearchParams(searchParams.toString()))
  const [reportFailure] = useState(() => createAuthCallbackFailureReporter(params.get('provider') === 'apple' ? 'apple' : 'google', captureMessage))
  const { setAuth } = useAuthStore()
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [accountBack, setAccountBack] = useState<LoginResponse | null>(null)
  const accountBackGeneration = useRef<number | null>(null)
  const [loading, setLoading] = useState(false)
  const processed = useRef(false)
  const [provider, setProvider] = useState<'apple' | 'google'>('google')

  useEffect(() => {
    if (processed.current) return
    processed.current = true
    const apple = params.get('provider') === 'apple'
    if (apple) queueMicrotask(() => setProvider('apple'))
    const code = apple ? params.get('handoff') : params.get('code')
    const oauthState = params.get('state')
    const intent = getGoogleAuthAppIntent({
      callback: { protocol: globalThis.location.protocol, host: globalThis.location.host, search: `?${params}` },
      userAgent: navigator.userAgent, pendingWebState,
      packageName: process.env.NEXT_PUBLIC_PLAY_PACKAGE_NAME,
    })
    if (intent) {
      queueMicrotask(() => {
        setAppIntent(intent)
        globalThis.location.assign(intent)
      })
      return
    }
    if (apple) globalThis.history.replaceState(null, '', '/auth-callback')
    const inputFailure = readAuthCallbackInput(params.has('error'), code, oauthState).reason
      ?? (apple && (oauthState !== pendingWebState || params.getAll('state').length !== 1 || params.getAll('handoff').length !== 1) ? 'state_mismatch' : null)
    if (inputFailure) {
      const storedReturn = sessionStorage.getItem('auth_return_url')
      const calendarReturn = storedReturn === '/calendar?import=1' || storedReturn === '/calendar?mode=review'
      const cancelled = ['access_denied', 'cancel', 'dismiss'].includes(params.get('error') ?? '')
      const finish = () => {
        if (storedReturn && calendarReturn && cancelled) router.replace(storedReturn)
        else { reportFailure(inputFailure); setState('failed') }
      }
      if (oauthState && !apple) {
        void fetchWithUpgradeGuidance(`/api/auth/google/code?state=${encodeURIComponent(oauthState)}`, { method: 'DELETE' })
          .then(finish, finish)
      } else queueMicrotask(finish)
      return
    }

    let ownedGeneration = getAccountGeneration()
    let failureReason: AuthCallbackFailureReason = 'exchange_failed'
    async function complete() {
      const referralCode = getCookieValue('referral_code')
      const generation = ownedGeneration
      const loginResponse = await withCookieSettingLogin(async () => {
        if (generation !== getAccountGeneration()) throw new AuthCallbackError('session_changed')
        const response = await fetchWithUpgradeGuidance(apple ? API.auth.appleHandoff : '/api/auth/google/code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apple ? { handoff: code, state: oauthState } : { code, state: oauthState, language: locale,
            ...(referralCode ? { referralCode } : {}) }),
        })
        if (generation !== getAccountGeneration()) throw new AuthCallbackError('session_changed')
        if (!response.ok) throw new AuthCallbackError('exchange_failed')
        const result = await response.json() as LoginResponse
        if (generation !== getAccountGeneration()) throw new AuthCallbackError('session_changed')
        if (!result.wasReactivated) {
          setAuth(result)
          ownedGeneration = getAccountGeneration()
        }
        return result
      })
      if (loginResponse.wasReactivated) {
        if (generation !== getAccountGeneration()) { reportFailure('session_changed'); return }
        accountBackGeneration.current = generation
        setAccountBack(loginResponse)
        setState('account')
        return
      }
      failureReason = 'profile_hydration_failed'
      await hydrateProfilePresentation()
      if (ownedGeneration !== getAccountGeneration()) { reportFailure('session_changed'); return }
      if (referralCode) {
        document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
      }
      const storedReturn = sessionStorage.getItem('auth_return_url')
      sessionStorage.removeItem('auth_return_url')
      const safeUrl = storedReturn?.startsWith('/') && !storedReturn.startsWith('//') ? storedReturn : '/'
      setRouteTransitionIntent('replace')
      router.push(safeUrl)
    }
    void complete().catch((error: unknown) => {
      reportFailure(error instanceof AuthCallbackError ? error.reason : failureReason)
      if (ownedGeneration === getAccountGeneration()) setState('failed')
    })
  }, [locale, params, pendingWebState, reportFailure, router, setAuth])

  async function continueAccount() {
    const expectedGeneration = accountBackGeneration.current
    if (!accountBack || loading || expectedGeneration === null) return
    if (expectedGeneration !== getAccountGeneration()) { reportFailure('session_changed'); return }
    setLoading(true)
    let ownedGeneration = expectedGeneration
    try {
      setAuth(accountBack)
      ownedGeneration = getAccountGeneration()
      await hydrateProfilePresentation()
      if (ownedGeneration !== getAccountGeneration()) { reportFailure('session_changed'); return }
      const storedReturn = sessionStorage.getItem('auth_return_url')
      sessionStorage.removeItem('auth_return_url')
      if (getCookieValue('referral_code')) {
        document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
      }
      setRouteTransitionIntent('replace')
      const safeUrl = storedReturn?.startsWith('/') && !storedReturn.startsWith('//') ? storedReturn : '/'
      router.push(safeUrl)
    } catch {
      reportFailure(ownedGeneration === getAccountGeneration() ? 'profile_hydration_failed' : 'session_changed')
      if (ownedGeneration === getAccountGeneration()) setState('failed')
    }
    finally { setLoading(false) }
  }

  if (appIntent) return <div className="flex w-full flex-col gap-8 px-4 py-4 md:w-[420px] md:rounded-[var(--r-card)] md:bg-[var(--bg-card)] md:p-8 md:shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
    <Lockup />
    <div><PillLink href={appIntent}>{t('auth.openInOrbit')}</PillLink></div>
  </div>

  return <LoginContent callback={{ state, provider, onContinue: () => void continueAccount(), loading }} />
}

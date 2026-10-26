import { AppleAuthCallback } from '@/components/auth/apple-auth-callback'
import { captureMessage } from '@sentry/react-native'
import { AuthCallbackError, createAuthCallbackFailureReporter, readAuthCallbackInput, type AuthCallbackFailureReason } from '@orbit/shared/utils/auth-callback-failure'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLinkingURL } from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { clearStoredAuthReturnUrl, clearStoredReferralCode,
  getSafeReturnUrl, getStoredAuthReturnUrl, getStoredReferralCode,
  isAuthReturnUrlAttemptCurrent } from '@/lib/auth-flow'
import { AUTH_CALLBACK_URL, clearPendingGoogleAuthSession, completePendingGoogleAuthSession, extractGoogleAuthParams,
  recoverPendingGoogleAuthCallbackUrl, resolveGoogleAuthCallbackUrl,
  usePendingGoogleAuthSession, type GoogleAuthCompletion } from '@/lib/google-auth-callback'
import { completeGoogleAuthFromUrl } from '@/lib/google-auth'
import { getSessionGeneration, useAuthStore } from '@/stores/auth-store'
import { captureBuildEnabled, shouldRetainEmptyAuthCallback } from '@/lib/capture-mode'
import { LoginContent } from '@/components/auth/login-content'

function ownsReturnUrl(isCurrentLoginSession: () => boolean, attemptId: string): boolean {
  return isCurrentLoginSession() && isAuthReturnUrlAttemptCurrent(attemptId)
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ provider?: string }>()
  return params.provider === 'apple' ? <AppleAuthCallback /> : <GoogleAuthCallbackScreen />
}

function GoogleAuthCallbackScreen() {
  const { i18n } = useTranslation()
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string; error_description?: string }>()
  const rawUrl = useLinkingURL()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const { callbackUrl: sessionCallbackUrl, isPending,
    returnUrlAttemptId: sessionReturnUrlAttemptId } = usePendingGoogleAuthSession()
  const processedAttemptRef = useRef<string | null>(null)
  const returnUrlAttemptRef = useRef<string | null>(null)
  const accountBackEpochRef = useRef<number | null>(null)
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [accountBack, setAccountBack] = useState<BackendLoginResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkedLink, setCheckedLink] = useState(false)
  const [outcomeAttemptId, setOutcomeAttemptId] = useState(sessionReturnUrlAttemptId)

  if (outcomeAttemptId !== sessionReturnUrlAttemptId) {
    setOutcomeAttemptId(sessionReturnUrlAttemptId)
    setState('pending')
    setAccountBack(null)
    setLoading(false)
    setCheckedLink(false)
  }
  const candidateUrl = useMemo(() => resolveGoogleAuthCallbackUrl({
    sessionCallbackUrl, rawUrl, params, callbackUrl: AUTH_CALLBACK_URL,
  }), [params, rawUrl, sessionCallbackUrl])
  const failureIdentity = JSON.stringify([candidateUrl, sessionReturnUrlAttemptId])
  const [failureReport, setFailureReport] = useState(() => ({ identity: failureIdentity,
    report: createAuthCallbackFailureReporter('google', captureMessage) }))
  if (failureReport.identity !== failureIdentity) {
    setFailureReport({ identity: failureIdentity, report: createAuthCallbackFailureReporter('google', captureMessage) })
  }
  const reportFailure = failureReport.report

  useEffect(() => {
    if (processedAttemptRef.current !== null || sessionCallbackUrl || isPending) return
    let mounted = true
    async function recoverCallback() {
      try {
        if (candidateUrl && !await recoverPendingGoogleAuthCallbackUrl(candidateUrl) && mounted) {
          const callback = extractGoogleAuthParams(candidateUrl)
          reportFailure(readAuthCallbackInput(Boolean(callback.error), callback.code, callback.state).reason ?? 'state_mismatch')
          setState('failed')
        }
      } catch {
        if (mounted) { reportFailure('state_mismatch'); setState('failed') }
      } finally {
        if (mounted) setCheckedLink(true)
      }
    }
    void recoverCallback()
    return () => { mounted = false }
  }, [candidateUrl, isPending, reportFailure, sessionCallbackUrl])

  useEffect(() => {
    if (!sessionCallbackUrl || sessionReturnUrlAttemptId === null) return
    const returnUrlAttemptId = sessionReturnUrlAttemptId
    if (processedAttemptRef.current === returnUrlAttemptId) return
    if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
    processedAttemptRef.current = returnUrlAttemptId
    returnUrlAttemptRef.current = returnUrlAttemptId
    const sessionEpoch = getSessionGeneration().epoch
    async function handleCallback(url: string): Promise<GoogleAuthCompletion> {
      let failureReason: AuthCallbackFailureReason = 'exchange_failed'
      try {
        if (extractGoogleAuthParams(url).error) throw new AuthCallbackError('provider_error')
        const referral = await getStoredReferralCode()
        if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId) || sessionEpoch !== getSessionGeneration().epoch) { reportFailure('session_changed'); return }
        const response = await completeGoogleAuthFromUrl(url, i18n.language, referral ?? undefined)
        if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId) || sessionEpoch !== getSessionGeneration().epoch) { reportFailure('session_changed'); return }
        await clearPendingGoogleAuthSession(returnUrlAttemptId)
        if (sessionEpoch !== getSessionGeneration().epoch) { reportFailure('session_changed'); return }
        if (response.wasReactivated) {
          return { status: 'reactivated', response, sessionEpoch }
        }
        failureReason = 'profile_hydration_failed'
        const isCurrentLoginSession = await login(response.token, response.refreshToken, {
          userId: response.userId, name: response.name, email: response.email,
        }, sessionEpoch)
        if (!isCurrentLoginSession?.() || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) { reportFailure('session_changed'); return }
        if (referral) await clearStoredReferralCode()
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) { reportFailure('session_changed'); return }
        const storedReturnUrl = await getStoredAuthReturnUrl(returnUrlAttemptId)
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) { reportFailure('session_changed'); return }
        await clearStoredAuthReturnUrl(returnUrlAttemptId, isCurrentLoginSession)
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) { reportFailure('session_changed'); return }
        router.replace(getSafeReturnUrl(storedReturnUrl))
      } catch (error: unknown) {
        reportFailure(error instanceof AuthCallbackError ? error.reason : failureReason)
        if (!ownsReturnUrl(() => sessionEpoch === getSessionGeneration().epoch, returnUrlAttemptId)) return
        await clearPendingGoogleAuthSession(returnUrlAttemptId)
        return { status: 'failed' }
      }
    }
    void completePendingGoogleAuthSession(returnUrlAttemptId, () => handleCallback(sessionCallbackUrl))
      .then((outcome) => {
        if (!outcome || !ownsReturnUrl(() => sessionEpoch === getSessionGeneration().epoch, returnUrlAttemptId)) return
        if (outcome.status === 'failed') { setState('failed'); return }
        accountBackEpochRef.current = outcome.sessionEpoch
        setAccountBack(outcome.response)
        setState('account')
      })
      .catch(() => {
        if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
        reportFailure('exchange_failed')
        setState('failed')
      })
  }, [i18n.language, login, reportFailure, router, sessionCallbackUrl, sessionReturnUrlAttemptId])

  useEffect(() => {
    if (shouldRetainEmptyAuthCallback(captureBuildEnabled) || processedAttemptRef.current !== null || state !== 'pending'
      || sessionCallbackUrl || isPending || !checkedLink) return
    const timeout = setTimeout(() => router.replace('/login'), 250)
    return () => clearTimeout(timeout)
  }, [checkedLink, isPending, router, sessionCallbackUrl, state])

  async function continueAccount() {
    if (!accountBack || loading) return
    const returnUrlAttemptId = returnUrlAttemptRef.current
    const expectedEpoch = accountBackEpochRef.current
    if (returnUrlAttemptId === null || expectedEpoch === null
      || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)
      || expectedEpoch !== getSessionGeneration().epoch) return
    setLoading(true)
    try {
      const isCurrentLoginSession = await login(accountBack.token, accountBack.refreshToken, {
        userId: accountBack.userId, name: accountBack.name, email: accountBack.email,
      }, expectedEpoch)
      if (!isCurrentLoginSession?.() || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
      const referralCode = await getStoredReferralCode()
      if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      if (referralCode) {
        await clearStoredReferralCode()
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      }
      const storedReturnUrl = await getStoredAuthReturnUrl(returnUrlAttemptId)
      if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      await clearStoredAuthReturnUrl(returnUrlAttemptId, isCurrentLoginSession)
      if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      router.replace(getSafeReturnUrl(storedReturnUrl))
    } catch { reportFailure('profile_hydration_failed'); setState('failed') }
    finally { setLoading(false) }
  }

  return <LoginContent callback={{ state, onContinue: () => void continueAccount(), loading }} />
}

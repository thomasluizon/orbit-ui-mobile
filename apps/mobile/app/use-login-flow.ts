import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { ApiClientError, extractAuthBackendMessage, isValidEmail, resolveAuthLoginErrorKey,
  deriveLoginEmailSubmission, recordLoginFailure, type LoginAttempts, type LoginCodeFailure } from '@orbit/shared/utils'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { clearStoredReferralCode, consumeStoredAuthReturnUrl, getSafeReturnUrl, getStoredReferralCode,
  isSafeReturnUrl, isValidReferralCode, isValidVerificationCode, markReferralApplied,
  storeAuthReturnUrl, storeReferralCode } from '@/lib/auth-flow'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { useOffline } from '@/hooks/use-offline'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

export function useLoginFlow() {
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{ ref?: string; returnUrl?: string; email?: string; code?: string; from?: string }>()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const { isOnline } = useOffline()
  const onboardingLocallyDone = useOnboardingDraftStore((s) => s.onboardingLocallyDone)
  const plannedHabitCount = useOnboardingDraftStore((s) => s.habits.length)
  const fromOnboarding = params.from === 'onboarding' || onboardingLocallyDone
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showReferralBanner, setShowReferralBanner] = useState(false)
  const [codeFailure, setCodeFailure] = useState<LoginCodeFailure>(null)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [accountBack, setAccountBack] = useState<BackendLoginResponse | null>(null)
  const busy = useRef(false)
  const attempts = useRef(new Map<string, LoginAttempts>())
  const entry = useLoginCodeEntry((code) => { void verifyCode(code) })
  const { setCodeDigits } = entry

  useEffect(() => {
    let active = true
    async function hydrate() {
      if (typeof params.ref === 'string' && isValidReferralCode(params.ref)) await storeReferralCode(params.ref)
      const referral = await getStoredReferralCode()
      if (typeof params.returnUrl === 'string' && isSafeReturnUrl(params.returnUrl)) await storeAuthReturnUrl(params.returnUrl)
      if (!active) return
      setShowReferralBanner(Boolean(referral))
      if (typeof params.email === 'string') setEmail(params.email)
      if (typeof params.email === 'string' && isValidEmail(params.email) && isValidVerificationCode(params.code)) {
        setCodeDigits(params.code.split(''))
        setStep('code')
      }
    }
    void hydrate().catch(() => { if (active) setErrorKey('auth.errors.unknownError') })
    return () => { active = false }
  }, [params.code, params.email, params.ref, params.returnUrl, setCodeDigits])

  useEffect(() => {
    if (codeFailure !== 'locked') return
    if ((attempts.current.get(email.trim().toLowerCase())?.expiresAt ?? 0) <= Date.now()) return
    const timer = setInterval(() => {
      const until = attempts.current.get(email.trim().toLowerCase())?.expiresAt ?? 0
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLockCountdown(remaining)
      if (!remaining) { setCodeFailure(null); setErrorKey(null) }
    }, 1000)
    return () => clearInterval(timer)
  }, [codeFailure, email])

  function resolveErrorKey(error: unknown, source: 'magic-code' | 'send' = 'magic-code') {
    return resolveAuthLoginErrorKey({ status: error instanceof ApiClientError ? error.status : undefined,
      backendMessage: extractAuthBackendMessage(error), raw: error, source })
  }

  async function sendCode() {
    if (busy.current || !isOnline || !email.trim()) return
    const submission = deriveLoginEmailSubmission(email, attempts.current, Date.now())
    if (submission.status === 'invalid') {
      setErrorKey('auth.errors.invalidEmail')
      setEmailFocusRequest((request) => request + 1)
      return
    }
    if (submission.status === 'locked') {
      setStep('code')
      setCodeFailure('locked')
      setLockCountdown(submission.remainingSeconds)
      setErrorKey(null)
      return
    }
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await apiClient(API.auth.sendCode, { method: 'POST', body: JSON.stringify({ email: email.trim(), language: i18n.language }) })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      entry.startResendCountdown()
    } catch (error: unknown) { setErrorKey(resolveErrorKey(error, 'send')) }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  async function completeLogin(response: BackendLoginResponse, today = false) {
    await login(response.token, response.refreshToken, { userId: response.userId, name: response.name, email: response.email })
    if (await getStoredReferralCode()) {
      await markReferralApplied()
      await clearStoredReferralCode()
      setShowReferralBanner(false)
    }
    const returnUrl = getSafeReturnUrl(await consumeStoredAuthReturnUrl())
    router.replace(today ? '/' : returnUrl)
  }

  function reportVerificationFailure(error: unknown) {
    const key = resolveErrorKey(error)
    const address = email.trim().toLowerCase()
    const next = recordLoginFailure(key, attempts.current.get(address), Date.now())
    attempts.current.set(address, next.attempts)
    setCodeFailure(next.failure)
    setLockCountdown(next.failure === 'locked' ? Math.max(0, Math.ceil((next.attempts.expiresAt - Date.now()) / 1000)) : 0)
    setErrorKey(next.failure === 'locked' ? null : key)
  }

  async function verifyCode(codeOverride?: string) {
    const code = codeOverride ?? entry.codeDigits.join('')
    if (busy.current || !isOnline || code.length !== 6 || (codeFailure === 'locked' && lockCountdown > 0) || codeFailure === 'expired') return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      const referralCode = await getStoredReferralCode()
      const response = await apiClient<BackendLoginResponse>(API.auth.verifyCode, {
        method: 'POST', body: JSON.stringify({ email: email.trim(), code, language: i18n.language,
          ...(referralCode ? { referralCode } : {}) }),
      })
      if (response.wasReactivated) setAccountBack(response)
      else await completeLogin(response)
    } catch (error: unknown) { reportVerificationFailure(error) }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  async function resendCode() {
    if (busy.current || !isOnline || (codeFailure === 'locked' && lockCountdown > 0) || (!entry.canResend && codeFailure !== 'expired')) return
    busy.current = true
    setIsSubmitting(true)
    setIsResending(true)
    setSuccessMessage(null)
    setErrorKey(null)
    try {
      await apiClient(API.auth.sendCode, { method: 'POST', body: JSON.stringify({ email: email.trim(), language: i18n.language }) })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setSuccessMessage(t('auth.codeResent'))
      entry.startResendCountdown()
    } catch (error: unknown) { setErrorKey(resolveErrorKey(error, 'send')) }
    finally { busy.current = false; setIsSubmitting(false); setIsResending(false) }
  }

  function backToEmail() {
    if (busy.current) return
    setStep('email')
    setSuccessMessage(null)
    setErrorKey(null)
    setCodeFailure(null)
    entry.resetCodeDigits()
  }

  async function signInWithGoogle() {
    if (busy.current || !isOnline) return
    busy.current = true
    setIsGoogleLoading(true)
    setErrorKey(null)
    try {
      const result = await startMobileGoogleAuth({ returnUrl: typeof params.returnUrl === 'string' ? params.returnUrl : undefined })
      if (result.type === 'success') router.replace('/auth-callback')
    } catch { setErrorKey('auth.errors.googleError') }
    finally { busy.current = false; setIsGoogleLoading(false) }
  }

  async function continueAccount() {
    if (!accountBack || busy.current) return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try { await completeLogin(accountBack, true) }
    catch { setErrorKey('auth.errors.unknownError') }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  function openPrivacyPolicy() { router.push('/about') }
  function openTerms() { router.push('/about') }

  return { t, step, email, setEmail, emailFocusRequest, isSubmitting, isResending, isGoogleLoading, errorKey,
    errorMessage: errorKey ? t(errorKey) : null, successMessage, showReferralBanner, fromOnboarding,
    plannedHabitCount, isOnline, ...entry, codeFailure, lockCountdown, accountBack,
    canSubmitEmail: Boolean(email.trim()) && !isSubmitting && !isGoogleLoading && isOnline,
    canSubmitCode: entry.codeDigits.join('').length === 6 && !isSubmitting && isOnline,
    sendCode, verifyCode, resendCode, backToEmail, signInWithGoogle, continueAccount, openPrivacyPolicy, openTerms }
}

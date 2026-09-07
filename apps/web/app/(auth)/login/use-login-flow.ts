import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReducedMotion } from 'motion/react'
import { useTranslations, useLocale } from 'next-intl'
import { buildGoogleCalendarOAuthOptions, isValidEmail, isValidReferralCode, isValidVerificationCode,
  recordLoginFailure, type LoginAttempts, type LoginCodeFailure } from '@orbit/shared/utils'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useOffline } from '@/hooks/use-offline'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getSupabaseClient } from '@/lib/supabase'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import { fetchAuthEndpoint, getCookieValue, handleVerifySuccess, isOfflinePreflight, resolveLoginErrorState } from './login-form-helpers'
import type { LoginResponse } from '@orbit/shared/types/auth'

export function useLoginFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const { setAuth } = useAuthStore()
  const { isOnline } = useOffline()
  const prefersReducedMotion = useReducedMotion()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [codeFailure, setCodeFailure] = useState<LoginCodeFailure>(null)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [accountBack, setAccountBack] = useState<LoginResponse | null>(null)
  const busy = useRef(false)
  const attempts = useRef(new Map<string, LoginAttempts>())
  const entry = useLoginCodeEntry((code) => { void verifyCode(code) })
  const authStepMotion = resolveMotionPreset('route-replace', Boolean(prefersReducedMotion))
  const referralParam = searchParams.get('ref')
  const referralCode = isValidReferralCode(referralParam) ? referralParam : getCookieValue('referral_code')
  const fromOnboarding = searchParams.get('from') === 'onboarding'
  const pendingHabitCount = useOnboardingDraftStore((state) => state.habits.length)

  useEffect(() => { void useOnboardingDraftStore.persist.rehydrate() }, [])
  useEffect(() => {
    if (isValidReferralCode(referralParam)) {
      document.cookie = `referral_code=${encodeURIComponent(referralParam)};max-age=${7 * 24 * 60 * 60};path=/;samesite=strict;secure`
    }
  }, [referralParam])

  const searchParamsKey = searchParams.toString()
  const [previousSearchParamsKey, setPreviousSearchParamsKey] = useState<string | null>(null)
  if (searchParamsKey !== previousSearchParamsKey) {
    setPreviousSearchParamsKey(searchParamsKey)
    const queryEmail = searchParams.get('email')
    const queryCode = searchParams.get('code')
    if (queryEmail && isValidEmail(queryEmail) && isValidVerificationCode(queryCode)) {
      setEmail(queryEmail)
      entry.setCodeDigits(queryCode.split(''))
      setStep('code')
    }
  }

  useEffect(() => {
    if (codeFailure !== 'locked') return
    if ((attempts.current.get(email.trim().toLowerCase())?.expiresAt ?? 0) <= Date.now()) return
    const timer = setInterval(() => {
      const until = attempts.current.get(email.trim().toLowerCase())?.expiresAt ?? 0
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLockCountdown(remaining)
      if (!remaining) {
        setCodeFailure(null)
        setErrorKey(null)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [codeFailure, email])

  function available() { return !busy.current && isOnline && !isOfflinePreflight() }
  function getReturnUrl() {
    const url = searchParams.get('returnUrl')
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/'
  }

  async function sendCode() {
    if (!available() || !email.trim()) return
    if (!isValidEmail(email)) {
      setErrorKey('auth.errors.invalidEmail')
      setEmailFocusRequest((request) => request + 1)
      return
    }
    const locked = attempts.current.get(email.trim().toLowerCase())
    if (locked && locked.count >= 3 && locked.expiresAt > Date.now()) {
      setStep('code')
      setCodeFailure('locked')
      setLockCountdown(Math.ceil((locked.expiresAt - Date.now()) / 1000))
      setErrorKey(null)
      return
    }
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email: email.trim(), language: locale })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      entry.startResendCountdown()
    } catch (error: unknown) {
      setErrorKey(resolveLoginErrorState(error, t, 'send').key)
    } finally { busy.current = false; setIsSubmitting(false) }
  }

  function reportVerificationFailure(error: unknown) {
    const key = resolveLoginErrorState(error, t).key
    const address = email.trim().toLowerCase()
    const next = recordLoginFailure(key, attempts.current.get(address), Date.now())
    attempts.current.set(address, next.attempts)
    setCodeFailure(next.failure)
    setLockCountdown(next.failure === 'locked' ? Math.max(0, Math.ceil((next.attempts.expiresAt - Date.now()) / 1000)) : 0)
    setErrorKey(next.failure === 'locked' ? null : key)
  }

  async function completeLogin(response: LoginResponse, destination = getReturnUrl()) {
    await handleVerifySuccess(response, referralCode, setAuth, router, () => destination)
  }

  async function verifyCode(codeOverride?: string) {
    const code = codeOverride ?? entry.codeDigits.join('')
    if (!available() || code.length !== 6 || (codeFailure === 'locked' && lockCountdown > 0) || codeFailure === 'expired') return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      const response = await fetchAuthEndpoint('/api/auth/verify-code', {
        email: email.trim(), code, language: locale, ...(referralCode ? { referralCode } : {}),
      }) as LoginResponse
      if (response.wasReactivated) setAccountBack(response)
      else await completeLogin(response)
    } catch (error: unknown) { reportVerificationFailure(error) }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  async function resendCode() {
    if (!available() || (codeFailure === 'locked' && lockCountdown > 0) || (!entry.canResend && codeFailure !== 'expired')) return
    busy.current = true
    setIsSubmitting(true)
    setIsResending(true)
    setSuccessMessage(null)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email: email.trim(), language: locale })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setSuccessMessage(t('auth.codeResent'))
      entry.startResendCountdown()
    } catch (error: unknown) { setErrorKey(resolveLoginErrorState(error, t, 'send').key) }
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
    if (!available()) return
    busy.current = true
    setIsGoogleLoading(true)
    setErrorKey(null)
    try {
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: buildGoogleCalendarOAuthOptions({ redirectTo: `${globalThis.location.origin}/auth-callback` }),
      })
      if (!error) return
      setErrorKey('auth.errors.googleError')
    } catch { setErrorKey('auth.errors.googleError') }
    busy.current = false
    setIsGoogleLoading(false)
  }

  async function continueAccount() {
    if (!accountBack || busy.current) return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try { await completeLogin(accountBack, '/') }
    catch { setErrorKey('auth.errors.unknownError') }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  return { t, step, email, setEmail, emailFocusRequest, isSubmitting, isResending, isGoogleLoading, errorKey,
    errorMessage: errorKey ? t(errorKey) : null, successMessage, referralCode, fromOnboarding,
    pendingHabitCount, isOnline, authStepMotion, ...entry, codeFailure, lockCountdown, accountBack,
    sendCode, verifyCode, resendCode, backToEmail, signInWithGoogle, continueAccount }
}

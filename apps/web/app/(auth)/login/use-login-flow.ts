import { unmappedBackendFormError } from '@orbit/shared/hooks'
import { extractBackendFieldErrors, extractBackendErrorDetails, extractBackendErrorCode, getBackendFieldError } from '@orbit/shared/utils'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReducedMotion } from 'motion/react'
import { useTranslations, useLocale } from 'next-intl'
import { isValidEmail, isValidReferralCode, isValidVerificationCode,
  getNotificationDestination, deriveLoginEmailSubmission, recordLoginFailure, type LoginAttempts, type LoginCodeFailure } from '@orbit/shared/utils'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useOffline } from '@/hooks/use-offline'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import { fetchAuthEndpoint, getCookieValue, handleVerifySuccess, isOfflinePreflight, resolveLoginErrorState } from './login-form-helpers'
import { NOTIFICATION_URL_PARAM } from '@/lib/service-worker-registration'
import type { LoginResponse } from '@orbit/shared/types/auth'

export function useLoginFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const { setAuth } = useAuthStore()
  const { isOnline } = useOffline()
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const {
    token: turnstileToken,
    resetKey: turnstileResetKey,
    onToken: onTurnstileToken,
    takeToken: takeTurnstileToken,
  } = useTurnstileToken(turnstileSiteKey, isOnline)
  const prefersReducedMotion = useReducedMotion()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorKey, setLoginErrorKey] = useState<string | null>(
    searchParams.get('googleError') === '1' ? 'auth.errors.googleError' : null,
  )
  const [validationError, setValidationError] = useState<unknown>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [codeFocusRequest, setCodeFocusRequest] = useState(0)
  const [codeFailure, setCodeFailure] = useState<LoginCodeFailure>(null)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [accountBack, setAccountBack] = useState<LoginResponse | null>(null)
  const busy = useRef(false)
  const pendingAutoCode = useRef<string | null>(null)
  const attempts = useRef(new Map<string, LoginAttempts>())
  const entry = useLoginCodeEntry((code) => {
    if (!isOnline) return
    if (turnstileSiteKey && !turnstileToken) pendingAutoCode.current = code
    else void verifyCode(code)
  })
  const authStepMotion = resolveMotionPreset('route-replace', Boolean(prefersReducedMotion))
  const referralParam = searchParams.get('ref')
  const referralCode = isValidReferralCode(referralParam) ? referralParam : getCookieValue('referral_code')
  const fromOnboarding = searchParams.get('from') === 'onboarding'
  const pendingHabitCount = useOnboardingDraftStore((state) => state.habits.length)

  useEffect(() => { void useOnboardingDraftStore.persist.rehydrate() }, [])
  useEffect(() => {
    if (!isOnline) pendingAutoCode.current = null
  }, [isOnline])
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

  function setErrorKey(key: string | null) {
    setValidationError(null)
    setLoginErrorKey(key)
  }

  function available() { return !busy.current && isOnline && !isOfflinePreflight() }
  function getReturnUrl() {
    const destination = getNotificationDestination(searchParams.get(NOTIFICATION_URL_PARAM))
    if (destination) return destination.opensAstra ? '/?astra=open' : destination.url
    if (searchParams.get('astra') === 'open') return '/?astra=open'
    const url = searchParams.get('returnUrl')
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/'
  }

  async function sendCode() {
    if (!available() || !email.trim()) return
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
    const protection = takeTurnstileToken()
    if (!protection) return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email: email.trim(), language: locale, ...protection })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      entry.startResendCountdown()
    } catch (error: unknown) {
      if (!reportValidationFailure(error)) setErrorKey(resolveLoginErrorState(error, t, 'send').key)
    } finally { busy.current = false; setIsSubmitting(false) }
  }

  function reportValidationFailure(error: unknown): boolean {
    if (!extractBackendFieldErrors(error)) return false
    setErrorKey(null)
    setValidationError(error)
    if (getBackendFieldError(error, 'Code')) setCodeFocusRequest((request) => request + 1)
    if (getBackendFieldError(error, 'Email')) {
      setStep('email')
      setEmailFocusRequest((request) => request + 1)
    }
    return true
  }

  function reportVerificationFailure(error: unknown) {
    if (reportValidationFailure(error)) return

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
    if (!available() || (codeFailure === 'locked' && lockCountdown > 0) || codeFailure === 'expired') return
    if (!isValidVerificationCode(code)) {
      setErrorKey('auth.errors.codeFormat')
      setCodeFocusRequest((request) => request + 1)
      return
    }
    const protection = takeTurnstileToken()
    if (!protection) return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      const response = await fetchAuthEndpoint('/api/auth/verify-code', {
        email: email.trim(), code, language: locale, ...protection, ...(referralCode ? { referralCode } : {}),
      }) as LoginResponse
      if (response.wasReactivated) setAccountBack(response)
      else await completeLogin(response)
    } catch (error: unknown) { reportVerificationFailure(error) }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  function handleTurnstileToken(token: string | null) {
    onTurnstileToken(token)
    if (!token || !isOnline || !pendingAutoCode.current) return
    const code = pendingAutoCode.current
    pendingAutoCode.current = null
    void verifyCode(code)
  }

  function onCodeChange(value: string) {
    setErrorKey(null)
    if (pendingAutoCode.current !== value) pendingAutoCode.current = null
    entry.onCodeChange(value)
  }

  async function resendCode() {
    if (!available() || (codeFailure === 'locked' && lockCountdown > 0) || (!entry.canResend && codeFailure !== 'expired')) return
    const protection = takeTurnstileToken()
    if (!protection) return
    pendingAutoCode.current = null
    busy.current = true
    setIsSubmitting(true)
    setIsResending(true)
    setSuccessMessage(null)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email: email.trim(), language: locale, ...protection })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setSuccessMessage(t('auth.codeResent'))
      entry.startResendCountdown()
    } catch (error: unknown) { if (!reportValidationFailure(error)) setErrorKey(resolveLoginErrorState(error, t, 'send').key) }
    finally { busy.current = false; setIsSubmitting(false); setIsResending(false) }
  }

  function backToEmail() {
    if (busy.current) return
    setStep('email')
    setSuccessMessage(null)
    setErrorKey(null)
    setCodeFailure(null)
    pendingAutoCode.current = null
    entry.resetCodeDigits()
  }

  function signInWithGoogle() {
    if (!available()) return
    busy.current = true
    setIsGoogleLoading(true)
    setErrorKey(null)
    try {
      sessionStorage.setItem('auth_return_url', getReturnUrl())
      globalThis.location.assign('/api/auth/google/start?purpose=signin')
    } catch {
      setErrorKey('auth.errors.googleError')
      busy.current = false
      setIsGoogleLoading(false)
    }
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

  return { t, step, email, setEmail: (value: string) => { setEmail(value); setErrorKey(null) }, emailFocusRequest, isSubmitting, isResending, isGoogleLoading, errorKey,
    emailFieldError: getBackendFieldError(validationError, 'Email'),
    codeFieldError: getBackendFieldError(validationError, 'Code'),
    codeFocusRequest,
    validationErrorDetails: extractBackendErrorDetails(validationError),
    validationCode: extractBackendErrorCode(validationError) ?? (errorKey === 'auth.errors.codeFormat' ? 'VALIDATION_VERIFICATION_CODE_FORMAT' : undefined),
    onCodeBlur: () => { if (entry.codeDigits.join('').length > 0 && !isValidVerificationCode(entry.codeDigits.join(''))) setErrorKey('auth.errors.codeFormat') },
    validationGeneralError: unmappedBackendFormError(validationError, [step === 'email' ? 'Email' : 'Code']),
    errorMessage: errorKey ? t(errorKey) : null, successMessage, referralCode, fromOnboarding,
    turnstileSiteKey, turnstileToken, turnstileResetKey, onTurnstileToken: handleTurnstileToken,
    pendingHabitCount, isOnline, authStepMotion, ...entry, onCodeChange, codeFailure, lockCountdown, accountBack,
    sendCode, verifyCode, resendCode, backToEmail, signInWithGoogle, continueAccount }
}

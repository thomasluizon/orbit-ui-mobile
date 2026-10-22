import { unmappedBackendFormError } from '@orbit/shared/hooks'
import { extractBackendFieldErrors, extractBackendErrorDetails, extractBackendErrorCode, getBackendFieldError } from '@orbit/shared/utils'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReducedMotion } from 'motion/react'
import { useTranslations, useLocale } from 'next-intl'
import { isValidEmail, isValidReferralCode, isValidVerificationCode,
  getNotificationDestination, deriveLoginEmailSubmission, recordLoginFailure, type LoginAttempts, type LoginCodeFailure } from '@orbit/shared/utils'
import { LoginAttemptScope, readLoginEmailLink, isSafeAuthReturnUrl, type LoginAttempt, type LoginEmailLink } from '@orbit/shared/utils/login-attempt'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useOffline } from '@/hooks/use-offline'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useAuthStore } from '@/stores/auth-store'
import { getSessionEpoch } from '@/lib/session-epoch'
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
    resetToken: resetTurnstileToken,
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
  const [attemptScope] = useState(() => new LoginAttemptScope())
  const pendingAutoCode = useRef<{ code: string; attempt: LoginAttempt } | null>(null)
  const linkAttempt = useRef<{ attempt: LoginAttempt; submitted: boolean } | null>(null)
  const accountAttempt = useRef<LoginAttempt | null>(null)
  const [incomingLink, setIncomingLink] = useState<LoginEmailLink | null>(null)
  const [lastLink, setLastLink] = useState<LoginEmailLink | null>(null)
  const attempts = useRef(new Map<string, LoginAttempts>())
  const entry = useLoginCodeEntry((code) => {
    if (!isOnline) return
    if (turnstileSiteKey && !turnstileToken) pendingAutoCode.current = { code, attempt: attemptScope.capture(email, getSessionEpoch()) }
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
    captureEmailLink()
  }

  function captureEmailLink() {
    const emails = searchParams.getAll('email')
    const codes = searchParams.getAll('code')
    const queryEmail = emails.length === 0 ? undefined : emails.length === 1 ? emails[0] : null
    const queryCode = codes.length === 0 ? undefined : codes.length === 1 ? codes[0] : null
    const link = readLoginEmailLink(queryEmail, queryCode, lastLink)
    if (link !== undefined) setIncomingLink(link)
    if (link) {
      setLastLink(link)
      setEmail(link.email)
      entry.setCodeDigits(link.code.split(''))
      setStep('code')
      setAccountBack(null)
      setCodeFailure(null)
    }
  }

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe(() => attemptScope.observeSession(getSessionEpoch()))
    return () => { unsubscribe(); attemptScope.invalidate() }
  }, [attemptScope])

  useEffect(() => {
    if (!incomingLink) { linkAttempt.current = null; return }
    attemptScope.invalidate()
    if (turnstileSiteKey) resetTurnstileToken()
    pendingAutoCode.current = null
    linkAttempt.current = { attempt: attemptScope.capture(incomingLink.email, getSessionEpoch()), submitted: false }
  }, [attemptScope, incomingLink, resetTurnstileToken, turnstileSiteKey])

  useEffect(() => {
    const clean = new URLSearchParams(searchParamsKey)
    if (!clean.has('email') && !clean.has('code')) return
    if (!readLoginEmailLink(clean.getAll('email').length === 1 ? clean.get('email') : null, clean.getAll('code').length === 1 ? clean.get('code') : null)) {
      attemptScope.invalidate()
      pendingAutoCode.current = null
    }
    clean.delete('email')
    clean.delete('code')
    const query = clean.toString()
    window.history.replaceState(null, '', `/login${query ? `?${query}` : ''}`)
  }, [attemptScope, searchParamsKey])

  useEffect(() => {
    if (!incomingLink || !isOnline || (turnstileSiteKey && !turnstileToken) || isSubmitting) return
    let active = true
    void Promise.resolve().then(() => {
      const pending = linkAttempt.current
      if (!active || !pending || pending.submitted || !attemptScope.owns(pending.attempt, getSessionEpoch())) return
      pending.submitted = true
      entry.onCodeChange(incomingLink.code, true)
    })
    return () => { active = false }
  }, [attemptScope, incomingLink, isOnline, isSubmitting, turnstileSiteKey, turnstileToken, entry])

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

  function available() { return !busy.current && !useAuthStore.getState().isAuthenticated && isOnline && !isOfflinePreflight() }
  function getReturnUrl() {
    const destination = getNotificationDestination(searchParams.get(NOTIFICATION_URL_PARAM))
    if (destination) return destination.opensAstra ? '/?astra=proactive' : destination.url
    if (searchParams.get('astra') === 'proactive') return '/?astra=proactive'
    if (searchParams.get('astra') === 'open') return '/?astra=open'
    const url = searchParams.get('returnUrl')
    if (!isSafeAuthReturnUrl(url)) return '/'
    const pathname = url.split(/[?#]/)[0]
    return pathname === '/login' || pathname === '/auth-callback' ? '/' : url
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
    const attempt = attemptScope.capture(email, getSessionEpoch())
    const isCurrent = () => attemptScope.owns(attempt, getSessionEpoch())
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email: email.trim(), language: locale, ...protection })
      if (!isCurrent()) return
      entry.resetCodeDigits()
      setCodeFailure(null)
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      entry.startResendCountdown()
    } catch (error: unknown) {
      if (isCurrent() && !reportValidationFailure(error)) setErrorKey(resolveLoginErrorState(error, t, 'send').key)
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
    if (next.failure !== 'locked' && next.failure !== 'expired') setCodeFocusRequest((request) => request + 1)
    setLockCountdown(next.failure === 'locked' ? Math.max(0, Math.ceil((next.attempts.expiresAt - Date.now()) / 1000)) : 0)
    setErrorKey(next.failure === 'locked' ? null : key)
  }

  async function completeLogin(response: LoginResponse, attempt: LoginAttempt, destination = getReturnUrl()) {
    const isCurrent = () => attemptScope.owns(attempt, getSessionEpoch())
    await handleVerifySuccess(response, referralCode, (verified) => {
      attemptScope.release(attempt)
      setAuth(verified)
      attempt.epoch = getSessionEpoch()
    }, router, () => destination, isCurrent)
  }

  async function verifyCode(codeOverride?: string) {
    const code = codeOverride ?? entry.codeDigits.join('')
    if (!available() || (codeFailure === 'locked' && lockCountdown > 0) || codeFailure === 'expired') return
    const submission = deriveLoginEmailSubmission(email, attempts.current, Date.now())
    if (submission.status === 'locked') {
      setCodeFailure('locked')
      setLockCountdown(submission.remainingSeconds)
      return
    }
    if (!isValidVerificationCode(code)) {
      setErrorKey('auth.errors.codeFormat')
      setCodeFocusRequest((request) => request + 1)
      return
    }
    const attempt = attemptScope.capture(email, getSessionEpoch())
    const controller = new AbortController()
    const isCurrent = () => attemptScope.owns(attempt, getSessionEpoch())
    if (!isCurrent() || !isValidEmail(attempt.email)) return
    const protection = takeTurnstileToken()
    if (!protection) return
    pendingAutoCode.current = null
    attemptScope.watch(attempt, () => controller.abort())
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/verify-code', {
        email: attempt.email, code, language: locale, ...protection, ...(referralCode ? { referralCode } : {}),
      }, {
        signal: controller.signal, isCurrent,
        onSuccess: async (verified) => {
          const response = verified as LoginResponse
          if (response.wasReactivated) { accountAttempt.current = attempt; setAccountBack(response) }
          else await completeLogin(response, attempt)
        },
      })
    } catch (error: unknown) { if (isCurrent()) reportVerificationFailure(error) }
    finally { attemptScope.release(attempt); busy.current = false; setIsSubmitting(false) }
  }

  function handleTurnstileToken(token: string | null) {
    if (!onTurnstileToken(token)) return
    if (!token || !isOnline || !pendingAutoCode.current) return
    const pending = pendingAutoCode.current
    pendingAutoCode.current = null
    if (attemptScope.owns(pending.attempt, getSessionEpoch()) && pending.attempt.email === email.trim()) void verifyCode(pending.code)
  }

  function onCodeChange(value: string) {
    if (incomingLink && value !== incomingLink.code) {
      attemptScope.invalidate()
      setIncomingLink(null)
    }
    setErrorKey(null)
    if (pendingAutoCode.current?.code !== value) pendingAutoCode.current = null
    entry.onCodeChange(value)
  }

  async function resendCode() {
    if (!available() || (codeFailure === 'locked' && lockCountdown > 0) || (!entry.canResend && codeFailure !== 'expired')) return
    const protection = takeTurnstileToken()
    if (!protection) return
    attemptScope.invalidate()
    setIncomingLink(null)
    pendingAutoCode.current = null
    const attempt = attemptScope.capture(email, getSessionEpoch())
    const isCurrent = () => attemptScope.owns(attempt, getSessionEpoch())
    busy.current = true
    setIsSubmitting(true)
    setIsResending(true)
    setSuccessMessage(null)
    setErrorKey(null)
    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email: email.trim(), language: locale, ...protection })
      if (!isCurrent()) return
      entry.resetCodeDigits()
      setCodeFailure(null)
      setSuccessMessage(t('auth.codeResent'))
      entry.startResendCountdown()
    } catch (error: unknown) { if (isCurrent() && !reportValidationFailure(error)) setErrorKey(resolveLoginErrorState(error, t, 'send').key) }
    finally { busy.current = false; setIsSubmitting(false); setIsResending(false) }
  }

  function backToEmail() {
    if (busy.current) return
    attemptScope.invalidate()
    setIncomingLink(null)
    if (turnstileSiteKey) resetTurnstileToken()
    setAccountBack(null)
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
    const attempt = accountAttempt.current
    if (!accountBack || busy.current || !attempt || !attemptScope.owns(attempt, getSessionEpoch()) || useAuthStore.getState().isAuthenticated) return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try { await completeLogin(accountBack, attempt, '/') }
    catch { setErrorKey('auth.errors.unknownError') }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  function changeEmail(value: string) {
    if (value !== email) {
      attemptScope.invalidate()
      if (turnstileSiteKey && (step === 'code' || busy.current)) resetTurnstileToken()
      setIncomingLink(null)
      pendingAutoCode.current = null
      setAccountBack(null)
    }
    setEmail(value)
    setErrorKey(null)
  }

  return { t, step, email, setEmail: changeEmail, emailFocusRequest, isSubmitting, isResending, isGoogleLoading, errorKey,
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

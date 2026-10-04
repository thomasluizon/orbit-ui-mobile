import { extractBackendFieldErrors, extractBackendErrorDetails, extractBackendErrorCode, getBackendFieldError, getErrorMessage } from '@orbit/shared/utils'
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
import { clearStoredAuthReturnUrl, clearStoredReferralCode, createAuthReturnUrlAttempt,
  getSafeReturnUrl, getStoredAuthReturnUrl, getStoredReferralCode, isAuthReturnUrlAttemptCurrent,
  isSafeReturnUrl, isValidReferralCode, isValidVerificationCode,
  storeAuthReturnUrl, storeReferralCode } from '@/lib/auth-flow'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { clearPendingGoogleAuthSession, usePendingGoogleAuthSession } from '@/lib/google-auth-callback'
import { useOffline } from '@/hooks/use-offline'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

interface ReturnUrlAttempt {
  returnUrl?: string
  id: string
  ready: Promise<void>
}

function getOrCreateReturnUrlAttempt(
  attemptRef: { current: ReturnUrlAttempt | null },
  returnUrl?: string,
): ReturnUrlAttempt {
  if (!attemptRef.current || attemptRef.current.returnUrl !== returnUrl ||
    !isAuthReturnUrlAttemptCurrent(attemptRef.current.id)) {
    const id = createAuthReturnUrlAttempt()
    const ready = clearPendingGoogleAuthSession().then(() => returnUrl && isSafeReturnUrl(returnUrl)
      ? storeAuthReturnUrl(returnUrl, id)
      : clearStoredAuthReturnUrl(id))
    attemptRef.current = { returnUrl, id, ready }
  }
  return attemptRef.current
}

export function useLoginFlow(isAuthCallback = false) {
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{ ref?: string; returnUrl?: string; email?: string; code?: string; from?: string; googleError?: string }>()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const { isOnline } = useOffline()
  const turnstileSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY
  const {
    token: turnstileToken,
    resetKey: turnstileResetKey,
    onToken: onTurnstileToken,
    takeToken: takeTurnstileToken,
  } = useTurnstileToken(turnstileSiteKey, isOnline)
  const onboardingLocallyDone = useOnboardingDraftStore((s) => s.onboardingLocallyDone)
  const plannedHabitCount = useOnboardingDraftStore((s) => s.habits.length)
  const fromOnboarding = plannedHabitCount > 0 && (
    params.from === 'onboarding' || onboardingLocallyDone
  )
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const googleSession = usePendingGoogleAuthSession()
  const [dismissedGoogleAttemptId, setDismissedGoogleAttemptId] = useState<string | null>(null)
  const [loginErrorKey, setLoginErrorKey] = useState<string | null>(
    params.googleError === '1' ? 'auth.errors.googleError' : null,
  )
  const dismissedGoogleAttemptCurrent = dismissedGoogleAttemptId !== null
    && googleSession.returnUrlAttemptId === dismissedGoogleAttemptId
    && googleSession.callbackUrl === null
  const errorKey = dismissedGoogleAttemptCurrent ? 'auth.errors.googleError' : loginErrorKey
  const [validationError, setValidationError] = useState<unknown>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showReferralBanner, setShowReferralBanner] = useState(false)
  const [codeFocusRequest, setCodeFocusRequest] = useState(0)
  const [codeFailure, setCodeFailure] = useState<LoginCodeFailure>(null)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [accountBack, setAccountBack] = useState<BackendLoginResponse | null>(null)
  const busy = useRef(false)
  const pendingAutoCode = useRef<string | null>(null)
  const returnUrlAttemptRef = useRef<ReturnUrlAttempt | null>(null)
  const attempts = useRef(new Map<string, LoginAttempts>())
  const entry = useLoginCodeEntry((code) => {
    if (!isOnline) return
    if (turnstileSiteKey && !turnstileToken) pendingAutoCode.current = code
    else void verifyCode(code)
  })
  const { setCodeDigits } = entry

  useEffect(() => {
    if (!isOnline) pendingAutoCode.current = null
  }, [isOnline])

  useEffect(() => {
    let active = true
    async function hydrate() {
      const returnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
      const safeReturnUrl = returnUrl && isSafeReturnUrl(returnUrl) ? returnUrl : undefined
      if (!isAuthCallback && (safeReturnUrl || returnUrlAttemptRef.current?.returnUrl)) {
        await getOrCreateReturnUrlAttempt(returnUrlAttemptRef, safeReturnUrl).ready
      }
      if (typeof params.ref === 'string' && isValidReferralCode(params.ref)) await storeReferralCode(params.ref)
      const referral = await getStoredReferralCode()
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
  }, [isAuthCallback, params.code, params.email, params.ref, params.returnUrl, setCodeDigits])

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

  function setErrorKey(key: string | null) {
    setValidationError(null)
    setDismissedGoogleAttemptId(null)
    setLoginErrorKey(key)
  }

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
    const protection = takeTurnstileToken()
    if (!protection) return
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await apiClient(API.auth.sendCode, { method: 'POST', body: JSON.stringify({ email: email.trim(), language: i18n.language, ...protection }) })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      entry.startResendCountdown()
    } catch (error: unknown) { if (!reportValidationFailure(error)) setErrorKey(resolveErrorKey(error, 'send')) }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  async function completeLogin(response: BackendLoginResponse, attemptId: string) {
    const isCurrentLoginSession = await login(response.token, response.refreshToken, {
      userId: response.userId, name: response.name, email: response.email,
    })
    if (!isCurrentLoginSession?.() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    const referralCode = await getStoredReferralCode()
    if (!isCurrentLoginSession()) return
    if (referralCode) {
      await clearStoredReferralCode()
      if (!isCurrentLoginSession()) return
      setShowReferralBanner(false)
    }
    if (!isCurrentLoginSession() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    const storedReturnUrl = await getStoredAuthReturnUrl(attemptId)
    if (!isCurrentLoginSession() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    await clearStoredAuthReturnUrl(attemptId, isCurrentLoginSession)
    if (!isCurrentLoginSession() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    const returnUrl = getSafeReturnUrl(storedReturnUrl)
    router.replace(returnUrl)
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
    if (busy.current || !isOnline || (codeFailure === 'locked' && lockCountdown > 0) || codeFailure === 'expired') return
    if (!isValidVerificationCode(code)) {
      setErrorKey('auth.errors.codeFormat')
      setCodeFocusRequest((request) => request + 1)
      return
    }
    const protection = takeTurnstileToken()
    if (!protection) return
    const returnUrlAttempt = getOrCreateReturnUrlAttempt(
      returnUrlAttemptRef, returnUrlAttemptRef.current?.returnUrl,
    )
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await returnUrlAttempt.ready
      const referralCode = await getStoredReferralCode()
      const response = await apiClient<BackendLoginResponse>(API.auth.verifyCode, {
        method: 'POST', body: JSON.stringify({ email: email.trim(), code, language: i18n.language,
          ...protection, ...(referralCode ? { referralCode } : {}) }),
      })
      if (response.wasReactivated) setAccountBack(response)
      else await completeLogin(response, returnUrlAttempt.id)
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
    if (busy.current || !isOnline || (codeFailure === 'locked' && lockCountdown > 0) || (!entry.canResend && codeFailure !== 'expired')) return
    const protection = takeTurnstileToken()
    if (!protection) return
    pendingAutoCode.current = null
    busy.current = true
    setIsSubmitting(true)
    setIsResending(true)
    setSuccessMessage(null)
    setErrorKey(null)
    try {
      await apiClient(API.auth.sendCode, { method: 'POST', body: JSON.stringify({ email: email.trim(), language: i18n.language, ...protection }) })
      entry.resetCodeDigits()
      setCodeFailure(null)
      setSuccessMessage(t('auth.codeResent'))
      entry.startResendCountdown()
    } catch (error: unknown) { if (!reportValidationFailure(error)) setErrorKey(resolveErrorKey(error, 'send')) }
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

  async function signInWithGoogle() {
    if (busy.current || !isOnline) return
    busy.current = true
    setIsGoogleLoading(true)
    setErrorKey(null)
    try {
      const result = await startMobileGoogleAuth({ returnUrl: typeof params.returnUrl === 'string' ? params.returnUrl : undefined })
      if (result.type === 'dismiss') setDismissedGoogleAttemptId(result.returnUrlAttemptId)
      else if (result.type !== 'success') setErrorKey('auth.errors.googleError')
    } catch { setErrorKey('auth.errors.googleError') }
    finally { busy.current = false; setIsGoogleLoading(false) }
  }

  async function continueAccount() {
    if (!accountBack || busy.current) return
    const returnUrlAttempt = getOrCreateReturnUrlAttempt(
      returnUrlAttemptRef, returnUrlAttemptRef.current?.returnUrl,
    )
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try { await returnUrlAttempt.ready; await completeLogin(accountBack, returnUrlAttempt.id) }
    catch { setErrorKey('auth.errors.unknownError') }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  function openPrivacyPolicy() { router.push('/about') }
  function openTerms() { router.push('/about') }

  return { t, step, email, setEmail: (value: string) => { setEmail(value); setErrorKey(null) }, emailFocusRequest, isSubmitting, isResending, isGoogleLoading, errorKey,
    emailFieldError: getBackendFieldError(validationError, 'Email'),
    codeFieldError: getBackendFieldError(validationError, 'Code'),
    codeFocusRequest,
    validationErrorDetails: extractBackendErrorDetails(validationError),
    validationCode: extractBackendErrorCode(validationError) ?? (errorKey === 'auth.errors.codeFormat' ? 'VALIDATION_VERIFICATION_CODE_FORMAT' : undefined),
    onCodeBlur: () => { if (entry.codeDigits.join('').length > 0 && !isValidVerificationCode(entry.codeDigits.join(''))) setErrorKey('auth.errors.codeFormat') },
    errorMessage: errorKey ? t(errorKey) : validationError && !getBackendFieldError(validationError, step === 'email' ? 'Email' : 'Code') ? getErrorMessage(validationError, '') : null, successMessage, showReferralBanner, fromOnboarding,
    plannedHabitCount, isOnline, ...entry, onCodeChange, codeFailure, lockCountdown, accountBack,
    canSubmitEmail: Boolean(email.trim()) && !isSubmitting && !isGoogleLoading && isOnline && (!turnstileSiteKey || Boolean(turnstileToken)),
    canSubmitCode: entry.codeDigits.join('').length === 6 && !isSubmitting && isOnline && (!turnstileSiteKey || Boolean(turnstileToken)),
    turnstileSiteKey, turnstileToken, turnstileResetKey, onTurnstileToken: handleTurnstileToken,
    sendCode, verifyCode, resendCode, backToEmail, signInWithGoogle, continueAccount, openPrivacyPolicy, openTerms }
}

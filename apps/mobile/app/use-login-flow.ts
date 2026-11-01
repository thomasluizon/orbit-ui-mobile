import { unmappedBackendFormError } from '@orbit/shared/hooks'
import { extractBackendFieldErrors, extractBackendErrorDetails, extractBackendErrorCode, getBackendFieldError } from '@orbit/shared/utils'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import type { NavigationProp, ParamListBase } from 'expo-router/react-navigation'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { ApiClientError, extractAuthBackendMessage, isValidEmail, resolveAuthLoginErrorKey,
  deriveLoginEmailSubmission, recordLoginFailure, type LoginAttempts, type LoginCodeFailure } from '@orbit/shared/utils'
import { LoginAttemptScope, readLoginEmailLink, type LoginAttempt, type LoginEmailLink } from '@orbit/shared/utils/login-attempt'
import { useAuthStore, getSessionGeneration } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { clearStoredAuthReturnUrl, clearStoredReferralCode, createAuthReturnUrlAttempt,
  getSafeReturnUrl, getStoredAuthReturnUrl, getStoredReferralCode, isAuthReturnUrlAttemptCurrent,
  isSafeReturnUrl, isValidReferralCode, isValidVerificationCode,
  storeAuthReturnUrl, storeReferralCode } from '@/lib/auth-flow'
import { startAppleAuthentication } from '@/lib/apple-auth'
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
  const navigation = useNavigation<NavigationProp<ParamListBase>>()
  const login = useAuthStore((s) => s.login)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const { isOnline } = useOffline()
  const turnstileSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY
  const {
    token: turnstileToken,
    resetKey: turnstileResetKey,
    onToken: onTurnstileToken,
    takeToken: takeTurnstileToken,
    resetToken: resetTurnstileToken,
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
  const [isAppleLoading, setIsAppleLoading] = useState(false)
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
  const [attemptScope] = useState(() => new LoginAttemptScope())
  const pendingAutoCode = useRef<{ code: string; attempt: LoginAttempt } | null>(null)
  const linkAttempt = useRef<{ attempt: LoginAttempt; submitted: boolean } | null>(null)
  const accountAttempt = useRef<LoginAttempt | null>(null)
  const committedAttempt = useRef<LoginAttempt | null>(null)
  const [incomingLink, setIncomingLink] = useState<LoginEmailLink | null>(null)
  const [lastLink, setLastLink] = useState<LoginEmailLink | null>(null)
  const returnUrlAttemptRef = useRef<ReturnUrlAttempt | null>(null)
  const attempts = useRef(new Map<string, LoginAttempts>())
  const entry = useLoginCodeEntry((code) => {
    if (!isOnline) return
    if (turnstileSiteKey && !turnstileToken) pendingAutoCode.current = { code, attempt: attemptScope.capture(email, getSessionGeneration().epoch) }
    else void verifyCode(code)
  })
  const queryEmail = params.email
  const queryCode = params.code
  const linkKey = JSON.stringify([queryEmail, queryCode])
  const [previousLinkKey, setPreviousLinkKey] = useState<string | null>(null)
  if (linkKey !== previousLinkKey) {
    setPreviousLinkKey(linkKey)
    const link = readLoginEmailLink(queryEmail, queryCode, lastLink, !isAuthCallback)
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
    const unsubscribe = useAuthStore.subscribe(() => attemptScope.observeSession(getSessionGeneration().epoch))
    return () => {
      unsubscribe()
      const committed = committedAttempt.current
      if (!committed || !useAuthStore.getState().isAuthenticated || !attemptScope.owns(committed, getSessionGeneration().epoch)) attemptScope.invalidate()
    }
  }, [attemptScope])

  useEffect(() => {
    if (!incomingLink) { linkAttempt.current = null; return }
    attemptScope.invalidate()
    if (turnstileSiteKey) resetTurnstileToken()
    pendingAutoCode.current = null
    linkAttempt.current = { attempt: attemptScope.capture(incomingLink.email, getSessionGeneration().epoch), submitted: false }
  }, [attemptScope, incomingLink, resetTurnstileToken, turnstileSiteKey])

  useEffect(() => {
    if (isAuthCallback || (queryEmail === undefined && queryCode === undefined)) return
    if (!readLoginEmailLink(queryEmail, queryCode)) { attemptScope.invalidate(); pendingAutoCode.current = null }
    const state = navigation.getState()
    navigation.dispatch({
      type: 'RESET',
      payload: {
        ...state,
        routes: state.routes.map((route) => route.name === 'login'
          ? { ...route, path: undefined, params: { ...route.params, email: undefined, code: undefined } }
          : route),
      },
    })
  }, [attemptScope, isAuthCallback, navigation, queryEmail, queryCode])

  useEffect(() => {
    if (!incomingLink || isAuthLoading || !isOnline || (turnstileSiteKey && !turnstileToken) || isSubmitting) return
    let active = true
    void Promise.resolve().then(() => {
      const pending = linkAttempt.current
      if (!active || !pending || pending.submitted || !attemptScope.owns(pending.attempt, getSessionGeneration().epoch)) return
      pending.submitted = true
      entry.onCodeChange(incomingLink.code, true)
    })
    return () => { active = false }
  }, [attemptScope, incomingLink, isAuthLoading, isOnline, isSubmitting, turnstileSiteKey, turnstileToken, entry])

  useEffect(() => {
    if (!isOnline) pendingAutoCode.current = null
  }, [isOnline])

  const hydrateReturnUrl = useEffectEvent(async () => {
    if (isAuthCallback || googleSession.returnUrlAttemptId !== null) return
    const returnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
    const safeReturnUrl = returnUrl && isSafeReturnUrl(returnUrl) ? returnUrl : undefined
    if (safeReturnUrl || returnUrlAttemptRef.current?.returnUrl) {
      await getOrCreateReturnUrlAttempt(returnUrlAttemptRef, safeReturnUrl).ready
    }
  })

  useEffect(() => {
    let active = true
    async function hydrate() {
      await hydrateReturnUrl()
      if (typeof params.ref === 'string' && isValidReferralCode(params.ref)) await storeReferralCode(params.ref)
      const referral = await getStoredReferralCode()
      if (!active) return
      setShowReferralBanner(Boolean(referral))
    }
    void hydrate().catch(() => { if (active) setErrorKey('auth.errors.unknownError') })
    return () => { active = false }
  }, [isAuthCallback, params.ref, params.returnUrl])

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
    const attempt = attemptScope.capture(email, getSessionGeneration().epoch)
    const isCurrent = () => attemptScope.owns(attempt, getSessionGeneration().epoch)
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await apiClient(API.auth.sendCode, { method: 'POST', body: JSON.stringify({ email: email.trim(), language: i18n.language, ...protection }) })
      if (!isCurrent()) return
      entry.resetCodeDigits()
      setCodeFailure(null)
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      entry.startResendCountdown()
    } catch (error: unknown) { if (isCurrent() && !reportValidationFailure(error)) setErrorKey(resolveErrorKey(error, 'send')) }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  async function completeLogin(response: BackendLoginResponse, attemptId: string, attempt: LoginAttempt) {
    const isCurrentAttempt = () => attemptScope.owns(attempt, getSessionGeneration().epoch) && isAuthReturnUrlAttemptCurrent(attemptId)
    if (!isCurrentAttempt() || useAuthStore.getState().isAuthenticated) return
    attemptScope.release(attempt)
    const isCurrentLoginSession = await login(response.token, response.refreshToken, {
      userId: response.userId, name: response.name, email: response.email,
    }, attempt.epoch, isCurrentAttempt, (epoch) => {
      attempt.epoch = epoch
      committedAttempt.current = attempt
    })
    if (!isCurrentLoginSession?.()) return
    attempt.epoch = getSessionGeneration().epoch
    if (!isCurrentAttempt() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    const referralCode = await getStoredReferralCode()
    if (!isCurrentLoginSession() || !isCurrentAttempt()) return
    if (referralCode) {
      await clearStoredReferralCode()
      if (!isCurrentLoginSession() || !isCurrentAttempt()) return
      setShowReferralBanner(false)
    }
    if (!isCurrentLoginSession() || !isCurrentAttempt() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    const storedReturnUrl = await getStoredAuthReturnUrl(attemptId)
    if (!isCurrentLoginSession() || !isCurrentAttempt() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
    await clearStoredAuthReturnUrl(attemptId, () => isCurrentLoginSession() && isCurrentAttempt())
    if (!isCurrentLoginSession() || !isCurrentAttempt() || !isAuthReturnUrlAttemptCurrent(attemptId)) return
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
    if (next.failure !== 'locked' && next.failure !== 'expired') setCodeFocusRequest((request) => request + 1)
    setLockCountdown(next.failure === 'locked' ? Math.max(0, Math.ceil((next.attempts.expiresAt - Date.now()) / 1000)) : 0)
    setErrorKey(next.failure === 'locked' ? null : key)
  }

  async function verifyCode(codeOverride?: string) {
    const code = codeOverride ?? entry.codeDigits.join('')
    if (busy.current || !isOnline || (codeFailure === 'locked' && lockCountdown > 0) || codeFailure === 'expired') return
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
    const attempt = attemptScope.capture(email, getSessionGeneration().epoch)
    const isCurrent = () => attemptScope.owns(attempt, getSessionGeneration().epoch)
    const controller = new AbortController()
    if (!isValidEmail(attempt.email) || useAuthStore.getState().isAuthenticated || useAuthStore.getState().isLoading) return
    const returnUrlAttempt = getOrCreateReturnUrlAttempt(
      returnUrlAttemptRef, typeof params.returnUrl === 'string' ? params.returnUrl : returnUrlAttemptRef.current?.returnUrl,
    )
    attemptScope.watch(attempt, () => controller.abort())
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try {
      await returnUrlAttempt.ready
      const referralCode = await getStoredReferralCode()
      if (!isCurrent() || !isAuthReturnUrlAttemptCurrent(returnUrlAttempt.id)) return
      const protection = takeTurnstileToken()
      if (!protection) return
      pendingAutoCode.current = null
      const response = await apiClient<BackendLoginResponse>(API.auth.verifyCode, {
        method: 'POST', body: JSON.stringify({ email: attempt.email, code, language: i18n.language,
          ...protection, ...(referralCode ? { referralCode } : {}) }), skipAuthRecovery: true, isCurrent, signal: controller.signal,
      })
      if (!isCurrent() || !isAuthReturnUrlAttemptCurrent(returnUrlAttempt.id)) return
      if (response.wasReactivated) { accountAttempt.current = attempt; setAccountBack(response) }
      else await completeLogin(response, returnUrlAttempt.id, attempt)
    } catch (error: unknown) { if (isCurrent()) reportVerificationFailure(error) }
    finally { attemptScope.release(attempt); busy.current = false; setIsSubmitting(false) }
  }

  function handleTurnstileToken(token: string | null) {
    if (!onTurnstileToken(token)) return
    if (!token || !isOnline || !pendingAutoCode.current) return
    const pending = pendingAutoCode.current
    pendingAutoCode.current = null
    if (attemptScope.owns(pending.attempt, getSessionGeneration().epoch) && pending.attempt.email === email.trim()) void verifyCode(pending.code)
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
    if (busy.current || !isOnline || (codeFailure === 'locked' && lockCountdown > 0) || (!entry.canResend && codeFailure !== 'expired')) return
    const protection = takeTurnstileToken()
    if (!protection) return
    attemptScope.invalidate()
    setIncomingLink(null)
    pendingAutoCode.current = null
    const attempt = attemptScope.capture(email, getSessionGeneration().epoch)
    const isCurrent = () => attemptScope.owns(attempt, getSessionGeneration().epoch)
    busy.current = true
    setIsSubmitting(true)
    setIsResending(true)
    setSuccessMessage(null)
    setErrorKey(null)
    try {
      await apiClient(API.auth.sendCode, { method: 'POST', body: JSON.stringify({ email: email.trim(), language: i18n.language, ...protection }) })
      if (!isCurrent()) return
      entry.resetCodeDigits()
      setCodeFailure(null)
      setSuccessMessage(t('auth.codeResent'))
      entry.startResendCountdown()
    } catch (error: unknown) { if (isCurrent() && !reportValidationFailure(error)) setErrorKey(resolveErrorKey(error, 'send')) }
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

  async function signInWithApple() {
    if (busy.current || !isOnline) return
    const attempt = attemptScope.capture('', getSessionGeneration().epoch)
    const isCurrent = () => attemptScope.owns(attempt, getSessionGeneration().epoch)
    const returnUrlAttempt = getOrCreateReturnUrlAttempt(returnUrlAttemptRef,
      typeof params.returnUrl === 'string' ? params.returnUrl : undefined)
    busy.current = true
    setIsAppleLoading(true)
    setErrorKey(null)
    try {
      await returnUrlAttempt.ready
      const referralCode = await getStoredReferralCode()
      const result = await startAppleAuthentication({ language: i18n.language,
        referralCode: referralCode ?? undefined, attemptId: returnUrlAttempt.id, isCurrent })
      if (!isCurrent()) return
      if (result.response) {
        if (result.response.wasReactivated) { accountAttempt.current = attempt; setAccountBack(result.response) }
        else await completeLogin(result.response, returnUrlAttempt.id, attempt)
      } else if (result.url) {
        router.replace({ pathname: '/auth-callback', params: Object.fromEntries(new URL(result.url).searchParams) })
      }
    } catch (error) {
      if (isCurrent() && !(error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED')) setErrorKey('auth.errors.appleError')
    } finally { busy.current = false; setIsAppleLoading(false) }
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
      else if (Platform.OS === 'ios') router.replace('/auth-callback')
    } catch { setErrorKey('auth.errors.googleError') }
    finally { busy.current = false; setIsGoogleLoading(false) }
  }

  async function continueAccount() {
    const attempt = accountAttempt.current
    if (!accountBack || busy.current || !attempt || !attemptScope.owns(attempt, getSessionGeneration().epoch)) return
    const returnUrlAttempt = getOrCreateReturnUrlAttempt(
      returnUrlAttemptRef, returnUrlAttemptRef.current?.returnUrl,
    )
    busy.current = true
    setIsSubmitting(true)
    setErrorKey(null)
    try { await returnUrlAttempt.ready; await completeLogin(accountBack, returnUrlAttempt.id, attempt) }
    catch { setErrorKey('auth.errors.unknownError') }
    finally { busy.current = false; setIsSubmitting(false) }
  }

  function openPrivacyPolicy() { router.push('/about') }
  function openTerms() { router.push('/about') }

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

  return { t, step, email, setEmail: changeEmail, emailFocusRequest, isSubmitting, isResending, isGoogleLoading, isAppleLoading, errorKey,
    emailFieldError: getBackendFieldError(validationError, 'Email'),
    codeFieldError: getBackendFieldError(validationError, 'Code'),
    codeFocusRequest,
    validationErrorDetails: extractBackendErrorDetails(validationError),
    validationCode: extractBackendErrorCode(validationError) ?? (errorKey === 'auth.errors.codeFormat' ? 'VALIDATION_VERIFICATION_CODE_FORMAT' : undefined),
    onCodeBlur: () => { if (entry.codeDigits.join('').length > 0 && !isValidVerificationCode(entry.codeDigits.join(''))) setErrorKey('auth.errors.codeFormat') },
    validationGeneralError: unmappedBackendFormError(validationError, [step === 'email' ? 'Email' : 'Code']),
    errorMessage: errorKey ? t(errorKey) : null, successMessage, showReferralBanner, fromOnboarding,
    plannedHabitCount, isOnline, ...entry, onCodeChange, codeFailure, lockCountdown, accountBack,
    canSubmitEmail: Boolean(email.trim()) && !isSubmitting && !isGoogleLoading && !isAppleLoading && isOnline && (!turnstileSiteKey || Boolean(turnstileToken)),
    canSubmitCode: entry.codeDigits.join('').length === 6 && !isSubmitting && isOnline && (!turnstileSiteKey || Boolean(turnstileToken)),
    turnstileSiteKey, turnstileToken, turnstileResetKey, onTurnstileToken: handleTurnstileToken,
    sendCode, verifyCode, resendCode, backToEmail, signInWithGoogle, signInWithApple, continueAccount, openPrivacyPolicy, openTerms }
}

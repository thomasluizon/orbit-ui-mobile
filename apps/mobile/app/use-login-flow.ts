import { useEffect, useMemo, useRef, useState } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Keyboard, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import {
  ApiClientError,
  extractAuthBackendMessage,
  isValidEmail,
  isVerificationCodeComplete,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useAppToast } from '@/hooks/use-app-toast'
import { easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import {
  clearStoredReferralCode,
  clearStoredAuthReturnUrl,
  getSafeReturnUrl,
  createAuthReturnUrlAttempt,
  isAuthReturnUrlAttemptCurrent,
  getStoredReferralCode,
  getStoredAuthReturnUrl,
  isSafeReturnUrl,
  isValidReferralCode,
  isValidVerificationCode,
  markReferralApplied,
  storeAuthReturnUrl,
  storeReferralCode,
} from '@/lib/auth-flow'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { useOffline } from '@/hooks/use-offline'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

interface AuthErrorState {
  message: string
}

interface ReturnUrlAttempt {
  returnUrl?: string
  id: number
}

function getOrCreateReturnUrlAttempt(
  attemptRef: { current: ReturnUrlAttempt | null },
  returnUrl?: string,
): number {
  if (!attemptRef.current || attemptRef.current.returnUrl !== returnUrl) {
    attemptRef.current = { returnUrl, id: createAuthReturnUrlAttempt() }
  }
  return attemptRef.current.id
}

export function useLoginFlow() {
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{
    ref?: string
    returnUrl?: string
    email?: string
    code?: string
    from?: string
  }>()
  const router = useRouter()
  const returnUrlAttemptRef = useRef<ReturnUrlAttempt | null>(null)
  const login = useAuthStore((s) => s.login)
  const { isOnline } = useOffline()
  const { showError } = useAppToast()
  const onboardingLocallyDone = useOnboardingDraftStore(
    (s) => s.onboardingLocallyDone,
  )
  const plannedHabitCount = useOnboardingDraftStore((s) => s.habits.length)
  const fromOnboarding = plannedHabitCount > 0 && (
    params.from === 'onboarding' || onboardingLocallyDone
  )

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const turnstileSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY
  const {
    token: turnstileToken,
    resetKey: turnstileResetKey,
    onToken: onTurnstileToken,
    takeToken: takeTurnstileToken,
  } = useTurnstileToken(turnstileSiteKey, isOnline)
  const [showReferralBanner, setShowReferralBanner] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const isCodeStep = step === 'code'
  const isAndroidKeyboardOpen = Platform.OS === 'android' && keyboardVisible
  const prefersReducedMotion = usePrefersReducedMotion()
  const stepEntrance = useMemo(() => new Animated.Value(1), [])
  const shakeOffset = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      stepEntrance.setValue(1)
      return
    }
    stepEntrance.setValue(0)
    const animation = Animated.timing(stepEntrance, {
      toValue: 1,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [prefersReducedMotion, step, stepEntrance])

  useEffect(() => {
    if (!errorMessage || step !== 'code' || prefersReducedMotion) return
    shakeOffset.setValue(0)
    const shakeFrame = (toValue: number) =>
      Animated.timing(shakeOffset, {
        toValue,
        duration: 56,
        useNativeDriver: true,
      })
    const animation = Animated.sequence([
      shakeFrame(-4),
      shakeFrame(4),
      shakeFrame(-4),
      shakeFrame(4),
      shakeFrame(0),
    ])
    animation.start()
    return () => animation.stop()
  }, [errorMessage, prefersReducedMotion, shakeOffset, step])

  const {
    codeDigits,
    setCodeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    startResendCountdown,
    resetCodeDigits,
    onCodeInput,
    onCodeKeyPress,
  } = useLoginCodeEntry(() => {
    void verifyCode()
  })

  useEffect(() => {
    async function hydrateAuthFlowState() {
      const refCode = typeof params.ref === 'string' ? params.ref : undefined
      const returnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
      const returnUrlAttemptId = getOrCreateReturnUrlAttempt(returnUrlAttemptRef, returnUrl)
      const deepLinkEmail = typeof params.email === 'string' ? params.email : undefined
      const deepLinkCode = typeof params.code === 'string' ? params.code : undefined

      if (returnUrl && isSafeReturnUrl(returnUrl)) {
        await storeAuthReturnUrl(returnUrl, returnUrlAttemptId)
      } else {
        await clearStoredAuthReturnUrl(returnUrlAttemptId)
      }

      if (refCode && isValidReferralCode(refCode)) {
        await storeReferralCode(refCode)
        setShowReferralBanner(true)
      } else {
        setShowReferralBanner(Boolean(await getStoredReferralCode()))
      }

      if (deepLinkEmail) {
        setEmail(deepLinkEmail)
      }

      if (deepLinkEmail && isValidVerificationCode(deepLinkCode)) {
        setCodeDigits(deepLinkCode.split(''))
        setStep('code')
      }
    }

    hydrateAuthFlowState().catch(() => {})
  }, [
    params.code,
    params.email,
    params.ref,
    params.returnUrl,
    setCodeDigits,
    setEmail,
    setShowReferralBanner,
    setStep,
  ])

  useEffect(() => {
    if (Platform.OS !== 'android') return

    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true)
    })
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  function resolveLoginErrorState(
    err: unknown,
    source: 'google' | 'magic-code' = 'magic-code',
  ): AuthErrorState {
    const status = err instanceof ApiClientError ? err.status : undefined
    const backendMessage = extractAuthBackendMessage(err)
    const key = resolveAuthLoginErrorKey({ status, backendMessage, raw: err, source })

    return { message: t(key) }
  }

  function reportError(message: string) {
    setErrorMessage(message)
    showError(message)
  }

  async function sendCode() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    const trimmed = email.trim()
    if (!trimmed) return
    if (!isValidEmail(trimmed)) {
      reportError(t('auth.errors.invalidEmail'))
      return
    }
    const protection = takeTurnstileToken()
    if (!protection) return
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await apiClient(API.auth.sendCode, {
        method: 'POST',
        body: JSON.stringify({ email: trimmed, language: i18n.language, ...protection }),
      })
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function finishReferral(
    referralCode: string,
    isCurrentLoginSession: () => boolean,
  ) {
    await markReferralApplied()
    if (!isCurrentLoginSession()) return
    await clearStoredReferralCode()
    if (!isCurrentLoginSession()) return
    setShowReferralBanner(false)
  }

  async function verifyCode() {
    const returnUrlAttemptId = getOrCreateReturnUrlAttempt(
      returnUrlAttemptRef, returnUrlAttemptRef.current?.returnUrl,
    )
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    const code = codeDigits.join('')
    if (code.length !== 6) return
    const protection = takeTurnstileToken()
    if (!protection) return
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      const referralCode = await getStoredReferralCode()
      const res = await apiClient<BackendLoginResponse>(API.auth.verifyCode, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          code,
          language: i18n.language,
          ...protection,
          ...(referralCode ? { referralCode } : {}),
        }),
      })
      const isCurrentLoginSession = await login(res.token, res.refreshToken, {
        userId: res.userId,
        name: res.name,
        email: res.email,
      })
      if (!isCurrentLoginSession?.()) return
      if (res.wasReactivated) {
        setSuccessMessage(t('profile.deleteAccount.reactivated'))
      }
      if (referralCode) {
        await finishReferral(referralCode, isCurrentLoginSession)
      }
      if (!isCurrentLoginSession()) return
      if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
      const storedReturnUrl = await getStoredAuthReturnUrl(returnUrlAttemptId)
      if (!isCurrentLoginSession() || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
      await clearStoredAuthReturnUrl(returnUrlAttemptId)
      if (!isCurrentLoginSession() || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
      const returnUrl = getSafeReturnUrl(storedReturnUrl)
      router.replace(returnUrl)
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err).message)
      resetCodeDigits()
      codeInputRefs.current[0]?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    if (!canResend) return
    const protection = takeTurnstileToken()
    if (!protection) return
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await apiClient(API.auth.sendCode, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), language: i18n.language, ...protection }),
      })
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function backToEmail() {
    setStep('email')
    setSuccessMessage(null)
    setErrorMessage(null)
    resetCodeDigits()
  }

  async function signInWithGoogle() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    setIsGoogleLoading(true)
    setErrorMessage(null)

    try {
      const pendingReturnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
      const result = await startMobileGoogleAuth({
        returnUrl: pendingReturnUrl,
      })

      if (result.type !== 'success') return

      router.replace('/auth-callback')
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err, 'google').message)
    } finally {
      setIsGoogleLoading(false)
    }
  }

  function openPrivacyPolicy() {
    router.push('/privacy')
  }

  function openTerms() {
    router.push('/terms')
  }

  const hasTurnstileToken = !turnstileSiteKey || Boolean(turnstileToken)
  const canSubmitEmail = Boolean(email.trim()) && !isSubmitting && isOnline && hasTurnstileToken
  const canSubmitCode =
    isVerificationCodeComplete(codeDigits) && !isSubmitting && isOnline && hasTurnstileToken

  return {
    t,
    step,
    email,
    setEmail,
    isSubmitting,
    isGoogleLoading,
    successMessage,
    turnstileSiteKey,
    turnstileToken,
    turnstileResetKey,
    onTurnstileToken,
    showReferralBanner,
    fromOnboarding,
    plannedHabitCount,
    isOnline,
    isCodeStep,
    isAndroidKeyboardOpen,
    stepEntrance,
    shakeOffset,
    codeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    onCodeInput,
    onCodeKeyPress,
    canSubmitEmail,
    canSubmitCode,
    sendCode,
    verifyCode,
    resendCode,
    backToEmail,
    signInWithGoogle,
    openPrivacyPolicy,
    openTerms,
  }
}

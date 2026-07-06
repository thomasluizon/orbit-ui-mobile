import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReducedMotion } from 'motion/react'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildGoogleCalendarOAuthOptions,
  isValidEmail,
  isValidReferralCode,
  isValidVerificationCode,
} from '@orbit/shared/utils'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOffline } from '@/hooks/use-offline'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getSupabaseClient } from '@/lib/supabase'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import {
  fetchAuthEndpoint,
  getCookieValue,
  handleVerifySuccess,
  isOfflinePreflight,
  resolveLoginErrorState,
} from './login-form-helpers'
import type { LoginResponse } from '@orbit/shared/types/auth'

export function useLoginFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const { setAuth } = useAuthStore()
  const { showError } = useAppToast()
  const { isOnline } = useOffline()
  const prefersReducedMotion = useReducedMotion()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const {
    codeDigits,
    setCodeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    startResendCountdown,
    resetCodeDigits,
    onCodeInput,
    onCodePaste,
    onCodeKeydown,
  } = useLoginCodeEntry((code) => {
    void verifyCode(code)
  })
  const authStepMotion = resolveMotionPreset('route-replace', Boolean(prefersReducedMotion))
  const feedbackMotion = resolveMotionPreset('success-feedback', Boolean(prefersReducedMotion))

  const referralCode = getCookieValue('referral_code')
  const fromOnboarding = searchParams.get('from') === 'onboarding'
  const pendingHabitCount = useOnboardingDraftStore((state) => state.habits.length)

  useEffect(() => {
    void useOnboardingDraftStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    const refParam = searchParams.get('ref')
    if (isValidReferralCode(refParam)) {
      document.cookie = `referral_code=${encodeURIComponent(refParam)};max-age=${7 * 24 * 60 * 60};path=/;samesite=strict;secure`
    }
  }, [searchParams])

  const searchParamsKey = searchParams.toString()
  const [previousSearchParamsKey, setPreviousSearchParamsKey] = useState<string | null>(null)
  if (searchParamsKey !== previousSearchParamsKey) {
    setPreviousSearchParamsKey(searchParamsKey)
    const emailFromQuery = searchParams.get('email')
    const codeFromQuery = searchParams.get('code')
    if (emailFromQuery && isValidVerificationCode(codeFromQuery)) {
      setEmail(emailFromQuery)
      setCodeDigits(codeFromQuery.split(''))
      setStep('code')
    }
  }

  const getReturnUrl = useCallback((): string => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      return returnUrl
    }
    return '/'
  }, [searchParams])

  function reportError(message: string) {
    setErrorMessage(message)
    showError(message)
  }

  async function sendCode() {
    if (!email.trim()) return
    if (!isValidEmail(email)) {
      reportError(t('auth.errors.invalidEmail'))
      return
    }
    if (isOfflinePreflight()) {
      reportError(t('auth.errors.offline'))
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email, language: locale })
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err, t).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function verifyCode(codeOverride?: string) {
    const code = codeOverride ?? codeDigits.join('')
    if (code.length !== 6) return
    if (isOfflinePreflight()) {
      reportError(t('auth.errors.offline'))
      return
    }
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      const loginResponse = (await fetchAuthEndpoint('/api/auth/verify-code', {
        email,
        code,
        language: locale,
        ...(referralCode ? { referralCode } : {}),
      })) as LoginResponse
      await handleVerifySuccess(
        loginResponse,
        referralCode,
        setAuth,
        setSuccessMessage,
        t,
        router,
        getReturnUrl,
      )
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err, t).message)
      resetCodeDigits()
      codeInputRefs.current[0]?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    if (!canResend) return
    if (isOfflinePreflight()) {
      reportError(t('auth.errors.offline'))
      return
    }
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email, language: locale })
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err, t).message)
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
    if (isOfflinePreflight()) {
      reportError(t('auth.errors.offline'))
      return
    }
    setIsGoogleLoading(true)
    setErrorMessage(null)

    try {
      const supabase = getSupabaseClient()
      const redirectTo = `${globalThis.location.origin}/auth-callback`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: buildGoogleCalendarOAuthOptions({ redirectTo }),
      })

      if (error) {
        reportError(t('auth.errors.googleError'))
        setIsGoogleLoading(false)
      }
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err, t, 'google').message)
      setIsGoogleLoading(false)
    }
  }

  return {
    t,
    step,
    email,
    setEmail,
    isSubmitting,
    isGoogleLoading,
    errorMessage,
    successMessage,
    referralCode,
    fromOnboarding,
    pendingHabitCount,
    isOnline,
    authStepMotion,
    feedbackMotion,
    codeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    onCodeInput,
    onCodeKeydown,
    onCodePaste,
    sendCode,
    verifyCode,
    resendCode,
    backToEmail,
    signInWithGoogle,
  }
}

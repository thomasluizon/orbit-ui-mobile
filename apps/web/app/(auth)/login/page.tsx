'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildGoogleCalendarOAuthOptions,
  extractAuthBackendMessage,
  extractBackendRequestId,
  isValidEmail,
  isValidVerificationCode,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAuthStore } from '@/stores/auth-store'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'
import { getSupabaseClient } from '@/lib/supabase'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import { SaturnDropcap } from '@/components/ui/saturn-dropcap'
import { UnderlinedInput } from '@/components/ui/underlined-input'
import { CodeInput } from '@/components/ui/code-input'
import type { LoginResponse } from '@orbit/shared/types/auth'

function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  const value = match?.[1]
  return value === undefined ? undefined : decodeURIComponent(value)
}

interface AuthFetchError {
  status: number
  body: unknown
}

interface AuthErrorState {
  message: string
  requestId?: string
}

function isAuthFetchError(err: unknown): err is AuthFetchError {
  return (
    !!err &&
    typeof err === 'object' &&
    typeof (err as { status?: unknown }).status === 'number'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function mergeRequestIdIntoBody(body: unknown, requestId: string | null): unknown {
  const trimmedRequestId = requestId?.trim()
  if (!trimmedRequestId) return body
  if (isRecord(body) && typeof body.requestId !== 'string') {
    return {
      ...body,
      requestId: trimmedRequestId,
    }
  }

  if (body === null) {
    return { requestId: trimmedRequestId }
  }

  return body
}

function appendAuthReference(
  message: string,
  requestId: string | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!requestId) return message
  return `${message} ${t('auth.errorReference', { requestId })}`
}

function resolveLoginErrorState(
  err: unknown,
  t: ReturnType<typeof useTranslations>,
  source: 'google' | 'magic-code' = 'magic-code',
): AuthErrorState {
  const status = isAuthFetchError(err) ? err.status : undefined
  const body = isAuthFetchError(err) ? err.body : err
  const backendMessage = extractAuthBackendMessage(body)
  const requestId = extractBackendRequestId(body)
  const key = resolveAuthLoginErrorKey({ status, backendMessage, raw: err, source })
  const message = t(key)

  return {
    message: appendAuthReference(message, requestId, t),
    requestId,
  }
}

function Spinner({ size = 4 }: Readonly<{ size?: number }>) {
  return (
    <svg className={`size-${size} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function PrimaryButton({
  children,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
}: Readonly<{
  children: React.ReactNode
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
}>) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      className="w-full appearance-none border-0 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
      style={{
        padding: '12px 18px',
        background: 'var(--primary)',
        color: 'var(--fg-on-primary)',
        borderRadius: 10,
        fontFamily: 'var(--font-family-sans)',
        fontSize: 14,
        fontWeight: 600,
        gap: 8,
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

function SecondaryButton({
  children,
  disabled = false,
  loading = false,
  onClick,
  leading,
}: Readonly<{
  children: React.ReactNode
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  leading?: React.ReactNode
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      className="w-full appearance-none cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
      style={{
        padding: '11px 18px',
        background: 'transparent',
        color: 'var(--fg-1)',
        border: 0,
        boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
        borderRadius: 10,
        fontFamily: 'var(--font-family-sans)',
        fontSize: 14,
        fontWeight: 500,
        gap: 8,
      }}
    >
      {loading ? <Spinner size={5} /> : leading}
      {children}
    </button>
  )
}

function QuietLink({
  children,
  onClick,
  emphasized = false,
  disabled = false,
  type = 'button',
}: Readonly<{
  children: React.ReactNode
  onClick?: () => void
  emphasized?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}>) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
      style={{
        padding: 6,
        fontFamily: 'var(--font-family-sans)',
        fontSize: 13,
        color: emphasized ? 'var(--fg-1)' : 'var(--fg-3)',
        textDecoration: emphasized ? 'underline' : 'none',
        textUnderlineOffset: 4,
      }}
    >
      {children}
    </button>
  )
}

interface EmailStepProps {
  email: string
  onEmailChange: (email: string) => void
  isSubmitting: boolean
  isGoogleLoading: boolean
  onSendCode: () => void
  onSignInWithGoogle: () => void
  t: ReturnType<typeof useTranslations>
}

function EmailStep({
  email,
  onEmailChange,
  isSubmitting,
  isGoogleLoading,
  onSendCode,
  onSignInWithGoogle,
  t,
}: Readonly<EmailStepProps>) {
  return (
    <div
      data-testid="login-email-step-stack"
      className="space-y-4 flex flex-col"
      style={{ gap: 16 }}
    >
      <form
        className="flex flex-col"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault()
          onSendCode()
        }}
      >
        <UnderlinedInput
          id="login-email"
          name="email"
          label={t('auth.email')}
          mono
          value={email}
          onChange={onEmailChange}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
        />
        <PrimaryButton
          type="submit"
          loading={isSubmitting}
          disabled={isSubmitting || !email.trim()}
        >
          {t('auth.sendCode')}
        </PrimaryButton>
      </form>

      <div className="flex items-center" style={{ gap: 14, padding: '8px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--fg-3)',
            letterSpacing: '0.06em',
          }}
        >
          {t('auth.orContinueWith')}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
      </div>

      <SecondaryButton
        loading={isGoogleLoading}
        disabled={isGoogleLoading}
        onClick={onSignInWithGoogle}
        leading={<GoogleIcon />}
      >
        {t('auth.signInWithGoogle')}
      </SecondaryButton>

      <p
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--fg-3)',
          fontStyle: 'italic',
          marginTop: 16,
        }}
      >
        {t('auth.legalPrefix')}{' '}
        <Link href="/about" className="underline">
          {t('auth.terms')}
        </Link>{' '}
        {t('auth.legalConjunction')}{' '}
        <Link href="/privacy" className="underline">
          {t('auth.privacy')}
        </Link>
        .
      </p>
    </div>
  )
}

interface CodeStepProps {
  email: string
  codeDigits: string[]
  isSubmitting: boolean
  canResend: boolean
  resendCountdown: number
  codeInputRefs: React.RefObject<(HTMLInputElement | null)[]>
  onVerifyCode: () => void
  onCodeInput: (index: number, value: string) => void
  onCodeKeydown: (index: number, event: React.KeyboardEvent<HTMLInputElement>) => void
  onCodePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  onBackToEmail: () => void
  onResendCode: () => void
  t: ReturnType<typeof useTranslations>
}

function CodeStep({
  email,
  codeDigits,
  isSubmitting,
  canResend,
  resendCountdown,
  codeInputRefs,
  onVerifyCode,
  onCodeInput,
  onCodeKeydown,
  onCodePaste,
  onBackToEmail,
  onResendCode,
  t,
}: Readonly<CodeStepProps>) {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        id="code-sent-to"
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--fg-3)',
          fontStyle: 'italic',
        }}
      >
        {t('auth.codeSentTo')} <span style={{ color: 'var(--fg-1)' }}>{email}</span>.
      </p>

      <form
        className="flex flex-col"
        style={{ gap: 18 }}
        onSubmit={(e) => {
          e.preventDefault()
          onVerifyCode()
        }}
      >
        <CodeInput
          digits={codeDigits}
          inputRefs={codeInputRefs}
          onChange={onCodeInput}
          onKeyDown={onCodeKeydown}
          onPaste={onCodePaste}
          ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
          ariaLabelledBy="code-sent-to"
        />

        <PrimaryButton
          type="submit"
          loading={isSubmitting}
          disabled={isSubmitting || codeDigits.join('').length !== 6}
        >
          {t('auth.verify')}
        </PrimaryButton>
      </form>

      <div
        className="flex justify-center"
        style={{
          fontFamily: 'var(--font-family-mono)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {canResend ? (
          <QuietLink emphasized onClick={onResendCode}>
            {t('auth.resendCode')}
          </QuietLink>
        ) : (
          <span style={{ padding: 6 }}>{t('auth.resendIn', { seconds: resendCountdown })}</span>
        )}
      </div>

      <div className="flex justify-center">
        <QuietLink onClick={onBackToEmail}>{t('auth.changeEmail')}</QuietLink>
      </div>
    </div>
  )
}

async function fetchAuthEndpoint(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const err: AuthFetchError = {
      status: response.status,
      body: mergeRequestIdIntoBody(data, response.headers.get('x-orbit-request-id')),
    }
    throw err
  }
  return response.json()
}

async function handleVerifySuccess(
  loginResponse: LoginResponse,
  referralCode: string | undefined,
  setAuth: (lr: LoginResponse) => void,
  setSuccessMessage: (msg: string | null) => void,
  t: ReturnType<typeof useTranslations>,
  router: ReturnType<typeof useRouter>,
  getReturnUrl: () => string,
) {
  setAuth(loginResponse)
  await hydrateProfilePresentation()
  if (referralCode) {
    localStorage.setItem('orbit_referral_applied', '1')
    document.cookie = 'referral_code=;max-age=0;path=/;samesite=strict;secure'
  }
  if (loginResponse.wasReactivated) {
    setSuccessMessage(t('profile.deleteAccount.reactivated'))
  }
  setRouteTransitionIntent('replace')
  router.push(getReturnUrl())
}

function isOfflinePreflight(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const { setAuth } = useAuthStore()
  const { showError } = useAppToast()
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

  useEffect(() => {
    const refParam = searchParams.get('ref')
    if (refParam && /^[a-zA-Z0-9_-]+$/.test(refParam)) {
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

  return (
    <div className="w-full max-w-[26rem] min-[480px]:min-w-[22rem]">
      <div
        className="flex flex-col"
        style={{ padding: '40px 28px 24px', gap: 18 }}
      >
        <div
          className="flex flex-col items-center"
          style={{ gap: 14, paddingBottom: 12 }}
        >
          <div style={{ color: 'var(--fg-1)' }}>
            <SaturnDropcap size={32} />
          </div>
          <div
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.025em',
              lineHeight: 1,
              color: 'var(--fg-1)',
            }}
          >
            Orbit
          </div>
          <div
            aria-hidden="true"
            style={{ width: 60, height: 1, background: 'var(--hairline-strong)', marginTop: 6 }}
          />
        </div>

        <h2
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--fg-3)',
            margin: 0,
          }}
        >
          {step === 'email' ? t('auth.signIn') : t('auth.enterCode')}
        </h2>

        {referralCode && (
          <motion.div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center justify-center"
            style={{
              padding: '8px 14px',
              borderTop: '1px solid var(--hairline)',
              borderBottom: '1px solid var(--hairline)',
            }}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                duration: feedbackMotion.enterDuration / 1000,
                ease: feedbackMotion.enterEasing,
              },
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--fg-1)',
                letterSpacing: '0.06em',
              }}
            >
              {t('referral.loginBanner')}
            </span>
          </motion.div>
        )}

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className="text-center"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--status-overdue)',
            }}
          >
            {errorMessage}
          </div>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {successMessage ? (
            <motion.div
              key={successMessage}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-center"
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--fg-2)',
              }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                  duration: feedbackMotion.enterDuration / 1000,
                  ease: feedbackMotion.enterEasing,
                },
              }}
              exit={{
                opacity: 0,
                y: -4,
                scale: 0.99,
                transition: {
                  duration: feedbackMotion.exitDuration / 1000,
                  ease: feedbackMotion.exitEasing,
                },
              }}
            >
              {successMessage}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={step}
            initial={{
              opacity: 0,
              x: step === 'email' ? -authStepMotion.shift : authStepMotion.shift,
              scale: authStepMotion.scaleFrom,
            }}
            animate={{
              opacity: 1,
              x: 0,
              scale: authStepMotion.scaleTo,
              transition: {
                duration: authStepMotion.enterDuration / 1000,
                ease: authStepMotion.enterEasing,
              },
            }}
            exit={{
              opacity: 0,
              x:
                step === 'email'
                  ? authStepMotion.shift * 0.4
                  : -authStepMotion.shift * 0.4,
              scale: 0.99,
              transition: {
                duration: authStepMotion.exitDuration / 1000,
                ease: authStepMotion.exitEasing,
              },
            }}
          >
            {step === 'email' ? (
              <EmailStep
                email={email}
                onEmailChange={setEmail}
                isSubmitting={isSubmitting}
                isGoogleLoading={isGoogleLoading}
                onSendCode={sendCode}
                onSignInWithGoogle={signInWithGoogle}
                t={t}
              />
            ) : (
              <CodeStep
                email={email}
                codeDigits={codeDigits}
                isSubmitting={isSubmitting}
                canResend={canResend}
                resendCountdown={resendCountdown}
                codeInputRefs={codeInputRefs}
                onVerifyCode={verifyCode}
                onCodeInput={onCodeInput}
                onCodeKeydown={onCodeKeydown}
                onCodePaste={onCodePaste}
                onBackToEmail={backToEmail}
                onResendCode={resendCode}
                t={t}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildGoogleCalendarOAuthOptions,
  extractAuthBackendMessage,
  extractBackendRequestId,
  isValidEmail,
  isValidVerificationCode,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAuthStore } from '@/stores/auth-store'
import { getSupabaseClient } from '@/lib/supabase'
import { hydrateProfilePresentation } from '@/lib/profile-presentation'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
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

// ---------------------------------------------------------------------------
// Sub-components (S3776: extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

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
    <svg className="size-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
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

function EmailStep({ email, onEmailChange, isSubmitting, isGoogleLoading, onSendCode, onSignInWithGoogle, t }: Readonly<EmailStepProps>) {
  return (
    <>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSendCode() }}>
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="form-label">{t('auth.email')}</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            autoComplete="email"
            className="form-input"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !email.trim()}
          aria-busy={isSubmitting}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-[var(--radius-xl)] transition-all active:scale-[0.98] disabled:opacity-50 shadow-[var(--shadow-glow)] flex items-center justify-center gap-2"
        >
          {isSubmitting && <Spinner />}
          {t('auth.sendCode')}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border-emphasis" />
        <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">{t('auth.orContinueWith')}</span>
        <div className="flex-1 h-px bg-border-emphasis" />
      </div>

      <button
        type="button"
        disabled={isGoogleLoading}
        onClick={onSignInWithGoogle}
        aria-busy={isGoogleLoading}
        className="w-full bg-white hover:bg-gray-50 text-gray-800 font-medium py-3.5 rounded-[var(--radius-xl)] border border-border-emphasis transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
      >
        {isGoogleLoading ? <Spinner size={5} /> : <GoogleIcon />}
        {t('auth.signInWithGoogle')}
      </button>
    </>
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
  email, codeDigits, isSubmitting, canResend, resendCountdown,
  codeInputRefs, onVerifyCode, onCodeInput, onCodeKeydown, onCodePaste,
  onBackToEmail, onResendCode, t,
}: Readonly<CodeStepProps>) {
  return (
    <>
      <p id="code-sent-to" className="text-sm text-text-secondary">
        {t('auth.codeSentTo')}{' '}
        <span className="text-text-primary font-medium">{email}</span>
      </p>

      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); onVerifyCode() }}>
        <fieldset
          className="flex justify-center gap-1.5 sm:gap-2 border-0 p-0 m-0"
          aria-labelledby="code-sent-to"
        >
          {codeDigits.map((digit, index) => (
            <input
              key={`code-digit-${index}`} // NOSONAR - fixed-length array where position is identity
              ref={(el) => { codeInputRefs.current[index] = el }}
              value={digit}
              data-code-index={index}
              aria-label={t('auth.codeDigit', { n: index + 1 })}
              type="text"
              inputMode="numeric"
              maxLength={20}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              onChange={(e) => onCodeInput(index, e.target.value)}
              onKeyDown={(e) => onCodeKeydown(index, e)}
              onPaste={onCodePaste}
              className="size-11 sm:w-12 sm:h-14 bg-surface-ground text-text-primary text-center text-lg sm:text-xl font-bold rounded-[var(--radius-md)] sm:rounded-[var(--radius-lg)] border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
            />
          ))}
        </fieldset>

        <button
          type="submit"
          disabled={isSubmitting || codeDigits.join('').length !== 6}
          aria-busy={isSubmitting}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-[var(--radius-xl)] transition-all active:scale-[0.98] disabled:opacity-50 shadow-[var(--shadow-glow)] flex items-center justify-center gap-2"
        >
          {isSubmitting && <Spinner />}
          {t('auth.verify')}
        </button>
      </form>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBackToEmail} className="text-sm text-text-muted hover:text-text-secondary transition-colors">
          {t('auth.changeEmail')}
        </button>
        <button
          type="button"
          disabled={!canResend}
          onClick={onResendCode}
          className="text-sm text-primary hover:underline font-semibold disabled:opacity-50 disabled:no-underline"
        >
          {canResend ? t('auth.resendCode') : `${t('auth.resendCode')} (${resendCountdown}s)`}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// API helpers (S3776: extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

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
  router.push(getReturnUrl())
}

function isOfflinePreflight(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const locale = useLocale()
  const { setAuth } = useAuthStore()
  const { showError } = useAppToast()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
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

  // Referral code from cookie
  const referralCode = getCookieValue('referral_code')

  // Read ref query param and store in cookie
  useEffect(() => {
    const refParam = searchParams.get('ref')
    if (refParam && /^[a-zA-Z0-9_-]+$/.test(refParam)) {
      document.cookie = `referral_code=${encodeURIComponent(refParam)};max-age=${7 * 24 * 60 * 60};path=/;samesite=strict;secure`
    }
  }, [searchParams])

  // Deep link pre-fill: /login?email=...&code=123456
  useEffect(() => {
    const emailFromQuery = searchParams.get('email')
    const codeFromQuery = searchParams.get('code')
    if (emailFromQuery && isValidVerificationCode(codeFromQuery)) {
      setEmail(emailFromQuery)
      setCodeDigits(codeFromQuery.split(''))
      setStep('code')
    }
  }, [searchParams])

  const getReturnUrl = useCallback((): string => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      return returnUrl
    }
    return '/'
  }, [searchParams])

  async function sendCode() {
    if (!email.trim()) return
    if (!isValidEmail(email)) {
      showError(t('auth.errors.invalidEmail'))
      return
    }
    if (isOfflinePreflight()) {
      showError(t('auth.errors.offline'))
      return
    }
    setIsSubmitting(true)

    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email, language: locale })
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      showError(resolveLoginErrorState(err, t).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function verifyCode(codeOverride?: string) {
    const code = codeOverride ?? codeDigits.join('')
    if (code.length !== 6) return
    if (isOfflinePreflight()) {
      showError(t('auth.errors.offline'))
      return
    }
    setIsSubmitting(true)
    setSuccessMessage(null)

    try {
      const loginResponse = await fetchAuthEndpoint('/api/auth/verify-code', {
        email,
        code,
        language: locale,
        ...(referralCode ? { referralCode } : {}),
      }) as LoginResponse
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
      showError(resolveLoginErrorState(err, t).message)
      resetCodeDigits()
      codeInputRefs.current[0]?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    if (!canResend) return
    if (isOfflinePreflight()) {
      showError(t('auth.errors.offline'))
      return
    }
    setIsSubmitting(true)
    setSuccessMessage(null)

    try {
      await fetchAuthEndpoint('/api/auth/send-code', { email, language: locale })
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      showError(resolveLoginErrorState(err, t).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function backToEmail() {
    setStep('email')
    setSuccessMessage(null)
    resetCodeDigits()
  }

  async function signInWithGoogle() {
    if (isOfflinePreflight()) {
      showError(t('auth.errors.offline'))
      return
    }
    setIsGoogleLoading(true)

    try {
      const supabase = getSupabaseClient()
      const redirectTo = `${globalThis.location.origin}/auth-callback`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: buildGoogleCalendarOAuthOptions({ redirectTo }),
      })

      if (error) {
        showError(t('auth.errors.googleError'))
        setIsGoogleLoading(false)
      }
    } catch (err: unknown) {
      showError(resolveLoginErrorState(err, t, 'google').message)
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="w-full max-w-[26rem] min-[480px]:min-w-[22rem]">
      <div className="bg-surface-overlay shadow-[var(--shadow-lg)] border border-border-muted rounded-[var(--radius-2xl)] p-6 space-y-6 min-[480px]:min-h-[30rem]">
        <h2 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary">
          {t('auth.welcomeBack')}
        </h2>

        {/* Referral banner */}
        {referralCode && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-emerald-400 flex items-center gap-2"
          >
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
            </svg>
            {t('referral.loginBanner')}
          </div>
        )}

        {/* Success alert */}
        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-emerald-400"
          >
            {successMessage}
          </div>
        )}

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

        {/* Privacy & Terms */}
        <p className="text-[10px] text-text-muted text-center pt-2">
          <Link href="/privacy" className="hover:underline">
            {t('privacy.title')}
          </Link>
        </p>
      </div>
    </div>
  )
}

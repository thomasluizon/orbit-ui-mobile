import * as m from 'motion/react-m'
import type { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { formatLoginCountdown, type LoginCodeFailure } from '@orbit/shared/utils'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { KeyboardRevealGroup } from '@/components/ui/keyboard-reveal-group'
import { LoginHeader, LoginOfflineNotice } from './login-sections'

interface CodeStepProps {
  email: string
  codeDigits: string[]
  isSubmitting: boolean
  isResending: boolean
  canResend: boolean
  resendCountdown: number
  lockCountdown: number
  codeFailure: LoginCodeFailure
  fieldError?: string
  onCodeBlur?: () => void
  codeFocusRequest?: number
  errorSignal: string | null
  successMessage: string | null
  isOnline: boolean
  canSubmitTurnstile: boolean
  turnstileWidget: ReactNode
  onVerifyCode: () => void
  onCodeChange: (value: string) => void
  onBackToEmail: () => void
  onResendCode: () => void
  t: ReturnType<typeof useTranslations>
}

/** The code field. A rejected code shakes it over the shared slow duration, and reduced motion keeps it still. */
export function LoginCodeField({ label, value, error, hint, disabled, expired, focusRequest, onChange, onBlur }: Readonly<{
  label: string; value: string; error: string | undefined; hint: string | undefined; disabled: boolean; expired: boolean
  focusRequest: number | undefined; onChange: (value: string) => void; onBlur: (() => void) | undefined
}>) {
  const reduced = useReducedMotion()
  const shake = Boolean(error) && !reduced
  return (
    <m.div animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }} data-code-shake={shake ? '' : undefined}
      transition={{ duration: reduced ? 0 : motionDurations.slow / 1000, ease: motionEasings.standard }} data-mock={expired || undefined}>
      <OtpInput label={label} value={value} onChange={onChange} onBlur={onBlur} focusRequest={focusRequest} error={error} hint={hint} disabled={disabled} />
    </m.div>
  )
}

/** The resend control: a countdown while the window is closed, then one quiet action. */
export function LoginResend({ ready, countdown, disabled, loading, onResend, t }: Readonly<{
  ready: boolean; countdown: number; disabled: boolean; loading: boolean; onResend: () => void; t: ReturnType<typeof useTranslations>
}>) {
  if (!ready) return <p className="font-mono text-xs tabular-nums text-[var(--fg-3)]">{t('auth.resendIn', { time: formatLoginCountdown(countdown) })}</p>
  return <PillButton variant="ghost" size="sm" onClick={onResend} disabled={disabled} loading={loading}>{t('auth.resendCode')}</PillButton>
}

export function CodeStep({ email, codeDigits, isSubmitting, isResending, canResend, resendCountdown, lockCountdown,
  codeFailure, fieldError: backendFieldError, onCodeBlur, codeFocusRequest, errorSignal, successMessage, isOnline, onVerifyCode, onCodeChange, onBackToEmail,
  onResendCode, canSubmitTurnstile, turnstileWidget, t }: Readonly<CodeStepProps>) {
  const locked = codeFailure === 'locked'
  const waiting = locked && lockCountdown > 0
  const expired = codeFailure === 'expired'
  const fieldError = isOnline && !locked ? backendFieldError ?? errorSignal ?? undefined : undefined
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <LoginHeader step="code" t={t} />
        <p className="wrap-anywhere text-base leading-normal text-[var(--fg-2)]">{t('auth.codeSentTo', { email })}</p>
        {successMessage && <p aria-hidden className="font-mono text-xs text-[var(--fg-3)]">{successMessage}</p>}
        <div className="self-start">
          <PillButton variant="ghost" size="sm" disabled={isSubmitting} onClick={onBackToEmail}>{t('auth.changeEmail')}</PillButton>
        </div>
      </div>
      <KeyboardRevealGroup testID="login-field-action" className="flex flex-col gap-6">
        <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); onVerifyCode() }}>
          <LoginCodeField label={t('auth.verificationCode')} value={codeDigits.join('')} onChange={onCodeChange} onBlur={onCodeBlur}
            focusRequest={codeFocusRequest} error={fieldError} hint={!fieldError && !locked ? t('auth.codeHint') : undefined}
            disabled={isSubmitting || expired || waiting} expired={expired} />
          {turnstileWidget}
          {!isOnline && <LoginOfflineNotice t={t} />}
          {!waiting && !expired && <PillButton disabled={isSubmitting || !isOnline || codeDigits.join('').length !== 6 || !canSubmitTurnstile}
            loading={isSubmitting && !isResending}>{t('auth.verify')}</PillButton>}
        </form>
        {!waiting && <div className="flex flex-col items-start gap-2">
          <LoginResend ready={canResend || expired} countdown={resendCountdown} disabled={!isOnline || isSubmitting || !canSubmitTurnstile}
            loading={isResending} onResend={onResendCode} t={t} />
        </div>}
        {locked && <div className="flex flex-col gap-2">
          <div role="status"><CapacityNotice message={t('auth.errors.tooManyAttempts')} /></div>
        </div>}
      </KeyboardRevealGroup>
    </div>
  )
}

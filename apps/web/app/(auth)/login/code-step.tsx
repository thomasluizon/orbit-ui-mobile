import type { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'motion/react'
import { motionEasings } from '@orbit/shared/theme'
import { formatLoginCountdown, type LoginCodeFailure } from '@orbit/shared/utils'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { LoginOfflineNotice } from './login-sections'

interface CodeStepProps {
  email: string
  codeDigits: string[]
  isSubmitting: boolean
  canResend: boolean
  resendCountdown: number
  lockCountdown: number
  codeFailure: LoginCodeFailure
  errorSignal: string | null
  successMessage: string | null
  isOnline: boolean
  onVerifyCode: () => void
  onCodeChange: (value: string) => void
  onBackToEmail: () => void
  onResendCode: () => void
  t: ReturnType<typeof useTranslations>
}

export function CodeStep({ email, codeDigits, isSubmitting, canResend, resendCountdown, lockCountdown,
  codeFailure, errorSignal, successMessage, isOnline, onVerifyCode, onCodeChange, onBackToEmail,
  onResendCode, t }: Readonly<CodeStepProps>) {
  const reduced = useReducedMotion()
  const locked = codeFailure === 'locked'
  const waiting = locked && lockCountdown > 0
  const expired = codeFailure === 'expired'
  const fieldError = isOnline && !locked ? errorSignal ?? undefined : undefined
  const shake = Boolean(fieldError) && !reduced
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base leading-normal text-[var(--fg-2)]">{t('auth.codeSentTo')} {email}.</p>
        {successMessage && <p aria-hidden className="font-mono text-xs text-[var(--fg-3)]">{successMessage}</p>}
        <div className="self-start">
          <PillButton variant="ghost" size="sm" disabled={isSubmitting} onClick={onBackToEmail}>{t('auth.changeEmail')}</PillButton>
        </div>
      </div>
      <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); onVerifyCode() }}>
        <motion.div animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: reduced ? 0 : 0.28, ease: motionEasings.standard }} data-mock={expired || undefined}>
          <OtpInput label={t('auth.verificationCode')} value={codeDigits.join('')}
            onChange={onCodeChange} error={fieldError}
            hint={!fieldError && !locked ? t('auth.codeHint') : undefined}
            disabled={isSubmitting || expired || waiting} />
        </motion.div>
        {!isOnline && <LoginOfflineNotice t={t} />}
        {!waiting && !expired && <PillButton disabled={isSubmitting || !isOnline || codeDigits.join('').length !== 6}
          loading={isSubmitting}>{t('auth.verify')}</PillButton>}
      </form>
      {!waiting && <div className="flex flex-col items-start gap-2">
        {canResend || expired
          ? <PillButton variant="ghost" size="sm" onClick={onResendCode} disabled={!isOnline || isSubmitting}>
              {t('auth.resendCode')}
            </PillButton>
          : <p className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
              {t('auth.resendIn', { time: formatLoginCountdown(resendCountdown) })}
            </p>}
      </div>}
      {locked && <div className="flex flex-col gap-2">
        <div role="status"><CapacityNotice message={t('auth.errors.tooManyAttempts')} /></div>
      </div>}
    </div>
  )
}

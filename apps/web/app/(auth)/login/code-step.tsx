import type { useTranslations } from 'next-intl'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* incl. components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { motion, useReducedMotion } from 'motion/react'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'

interface CodeStepProps {
  email: string
  codeDigits: string[]
  isSubmitting: boolean
  canResend: boolean
  resendCountdown: number
  errorSignal?: string | null
  isOnline: boolean
  onVerifyCode: () => void
  onCodeInput: (index: number, value: string) => void
  onBackToEmail: () => void
  onResendCode: () => void
  t: ReturnType<typeof useTranslations>
}

export function CodeStep({
  email,
  codeDigits,
  isSubmitting,
  canResend,
  resendCountdown,
  errorSignal = null,
  isOnline,
  onVerifyCode,
  onCodeInput,
  onBackToEmail,
  onResendCode,
  t,
}: Readonly<CodeStepProps>) {
  const prefersReducedMotion = useReducedMotion()
  const shake = Boolean(errorSignal) && !prefersReducedMotion

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        id="code-sent-to"
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          lineHeight: 1.55,
          color: 'var(--fg-2)',
          margin: 0,
        }}
      >
        {t('auth.codeSentTo')} <span style={{ color: 'var(--fg-1)' }}>{email}</span>.
      </p>

      <form
        className="flex flex-col"
        style={{ gap: 24 }}
        onSubmit={(e) => {
          e.preventDefault()
          onVerifyCode()
        }}
      >
        <motion.div
          key={errorSignal || 'code-steady'}
          animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
        >
          <OtpInput
            label={t('profile.deleteAccount.headingConfirmCode')}
            value={codeDigits.join('')}
            onChange={(value) => onCodeInput(0, value)}
            error={errorSignal ?? undefined}
          />
        </motion.div>

        <PillButton


          disabled={isSubmitting || codeDigits.join('').length !== 6}
          loading={isSubmitting}


        >
          {t('auth.verify')}
        </PillButton>
      </form>

      <div className="flex justify-center">
        {canResend ? (
          <QuietLink emphasized onClick={onResendCode} disabled={!isOnline}>
            {t('auth.resendCode')}
          </QuietLink>
        ) : (
          <span
            className="inline-flex items-center"
            style={{
              minHeight: 44,
              padding: '6px 12px',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('auth.resendIn', { seconds: resendCountdown })}
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <QuietLink onClick={onBackToEmail}>{t('auth.changeEmail')}</QuietLink>
      </div>
    </div>
  )
}

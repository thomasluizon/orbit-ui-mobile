import type { useTranslations } from 'next-intl'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* incl. components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { motion, useReducedMotion } from 'motion/react'
import { CodeInput } from '@/components/ui/code-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'
import { Spinner } from './login-atoms'

interface CodeStepProps {
  email: string
  codeDigits: string[]
  isSubmitting: boolean
  canResend: boolean
  resendCountdown: number
  codeInputRefs: React.RefObject<(HTMLInputElement | null)[]>
  errorSignal?: string | null
  isOnline: boolean
  onVerifyCode: () => void
  onCodeInput: (index: number, value: string) => void
  onCodeKeydown: (index: number, event: React.KeyboardEvent<HTMLInputElement>) => void
  onCodePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
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
  codeInputRefs,
  errorSignal = null,
  isOnline,
  onVerifyCode,
  onCodeInput,
  onCodeKeydown,
  onCodePaste,
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
          <CodeInput
            digits={codeDigits}
            inputRefs={codeInputRefs}
            onChange={onCodeInput}
            onKeyDown={onCodeKeydown}
            onPaste={onCodePaste}
            ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
            ariaLabelledBy="code-sent-to"
          />
        </motion.div>

        <PillButton
          type="submit"
          fullWidth
          disabled={isSubmitting || codeDigits.join('').length !== 6}
          busy={isSubmitting}
          leading={isSubmitting ? <Spinner /> : undefined}
          dataTestId="auth-verify-code"
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

import type { useTranslations } from 'next-intl'
import { CodeInput } from '@/components/ui/code-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink, Spinner } from './login-atoms'

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

export function CodeStep({
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
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--fg-3)',
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
        <CodeInput
          digits={codeDigits}
          inputRefs={codeInputRefs}
          onChange={onCodeInput}
          onKeyDown={onCodeKeydown}
          onPaste={onCodePaste}
          ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
          ariaLabelledBy="code-sent-to"
        />

        <PillButton
          type="submit"
          fullWidth
          disabled={isSubmitting || codeDigits.join('').length !== 6}
          busy={isSubmitting}
          leading={isSubmitting ? <Spinner /> : undefined}
        >
          {t('auth.verify')}
        </PillButton>
      </form>

      <div className="flex justify-center">
        {canResend ? (
          <QuietLink emphasized onClick={onResendCode}>
            {t('auth.resendCode')}
          </QuietLink>
        ) : (
          <span
            className="inline-flex items-center"
            style={{
              minHeight: 44,
              padding: '6px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-3)',
              letterSpacing: '0.02em',
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

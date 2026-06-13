import Link from 'next/link'
import type { useTranslations } from 'next-intl'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { GoogleIcon, Spinner } from './login-atoms'

interface EmailStepProps {
  email: string
  onEmailChange: (email: string) => void
  isSubmitting: boolean
  isGoogleLoading: boolean
  onSendCode: () => void
  onSignInWithGoogle: () => void
  t: ReturnType<typeof useTranslations>
}

export function EmailStep({
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
        style={{ gap: 20 }}
        onSubmit={(e) => {
          e.preventDefault()
          onSendCode()
        }}
      >
        <FieldInput
          id="login-email"
          name="email"
          label={t('auth.email')}
          value={email}
          onChange={onEmailChange}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
        />
        <PillButton
          type="submit"
          fullWidth
          disabled={isSubmitting || !email.trim()}
          busy={isSubmitting}
          leading={isSubmitting ? <Spinner /> : undefined}
        >
          {t('auth.sendCode')}
        </PillButton>
      </form>

      <div className="flex items-center" style={{ gap: 14, padding: '8px 0' }}>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
          }}
        >
          {t('auth.orContinueWith')}
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
      </div>

      <PillButton
        variant="ghost"
        fullWidth
        disabled={isGoogleLoading}
        busy={isGoogleLoading}
        onClick={onSignInWithGoogle}
        leading={isGoogleLoading ? <Spinner size={5} /> : <GoogleIcon />}
      >
        {t('auth.signInWithGoogle')}
      </PillButton>

      <p
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--fg-3)',
          marginTop: 12,
        }}
      >
        {t('auth.legalPrefix')}{' '}
        <Link href="/terms" className="underline" style={{ color: 'var(--fg-3)' }}>
          {t('auth.terms')}
        </Link>{' '}
        {t('auth.legalConjunction')}{' '}
        <Link href="/privacy" className="underline" style={{ color: 'var(--fg-3)' }}>
          {t('auth.privacy')}
        </Link>
        .
      </p>
    </div>
  )
}

import Link from 'next/link'
import type { useTranslations } from 'next-intl'
import { UnderlinedInput } from '@/components/ui/underlined-input'
import { GoogleIcon, PrimaryButton, SecondaryButton } from './login-atoms'

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
        <Link href="/terms" className="underline">
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

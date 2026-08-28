import Link from 'next/link'
import type { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'

interface EmailStepProps {
  email: string
  onEmailChange: (email: string) => void
  isSubmitting: boolean
  isGoogleLoading: boolean
  isOnline: boolean
  onSendCode: () => void
  onSignInWithGoogle: () => void
  t: ReturnType<typeof useTranslations>
  sendCodeLabel?: string
}

export function EmailStep({
  email,
  onEmailChange,
  isSubmitting,
  isGoogleLoading,
  isOnline,
  onSendCode,
  onSignInWithGoogle,
  t,
  sendCodeLabel,
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
        <Input
          label={t('auth.email')}
          value={email}
          onChange={onEmailChange}
          kind="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
        />
        <PillButton


          disabled={isSubmitting || !email.trim() || !isOnline}
          loading={isSubmitting}


        >
          {sendCodeLabel ?? t('auth.sendCode')}
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

        disabled={isGoogleLoading || !isOnline}
        loading={isGoogleLoading}
        onClick={onSignInWithGoogle}

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

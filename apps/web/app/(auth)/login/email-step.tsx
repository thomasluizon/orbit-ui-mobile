import Link from 'next/link'
import type { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { LoginOfflineNotice } from './login-sections'

interface EmailStepProps {
  email: string
  onEmailChange: (email: string) => void
  isSubmitting: boolean
  isGoogleLoading: boolean
  isOnline: boolean
  errorKey: string | null
  errorMessage: string | null
  onSendCode: () => void
  onSignInWithGoogle: () => void
  t: ReturnType<typeof useTranslations>
  sendCodeLabel?: string
}

export function EmailStep({ email, onEmailChange, isSubmitting, isGoogleLoading, isOnline,
  errorKey, errorMessage, onSendCode, onSignInWithGoogle, t, sendCodeLabel }: Readonly<EmailStepProps>) {
  const fieldError = isOnline && errorKey === 'auth.errors.invalidEmail' ? errorMessage : null
  const googleError = isOnline && errorKey === 'auth.errors.googleError' ? errorMessage : null
  const sendError = isOnline && errorMessage && !fieldError && !googleError ? errorMessage : null
  return (
    <div data-testid="login-email-step-stack" className="flex flex-col gap-6">
      <form noValidate className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); onSendCode() }}>
        <Input label={t('auth.email')} value={email} onChange={onEmailChange} kind="email"
          autoComplete="email" placeholder={t('auth.emailPlaceholder')}
          disabled={isSubmitting || isGoogleLoading} error={fieldError ?? undefined} />
        <div className="flex flex-col gap-3">
          {!isOnline && <LoginOfflineNotice t={t} />}
          {sendError && <p role="alert" className="text-sm text-[var(--status-bad-text)]">{sendError}</p>}
          <PillButton disabled={isSubmitting || isGoogleLoading || !email.trim() || !isOnline} loading={isSubmitting}>
            {sendCodeLabel ?? t('auth.sendCode')}
          </PillButton>
        </div>
      </form>
      <div aria-hidden className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--hairline)]" />
        <span className="font-mono text-xs text-[var(--fg-3)]">{t('auth.orContinueWith')}</span>
        <span className="h-px flex-1 bg-[var(--hairline)]" />
      </div>
      <div className="flex flex-col gap-2">
        <PillButton variant="ghost" disabled={isGoogleLoading || isSubmitting || !isOnline}
          loading={isGoogleLoading} onClick={onSignInWithGoogle}>{t('auth.signInWithGoogle')}</PillButton>
        {!isOnline && <p className="text-sm text-[var(--fg-3)]">{t('auth.googleOffline')}</p>}
        {googleError && <p role="alert" className="text-sm text-[var(--status-bad-text)]">{googleError}</p>}
      </div>
      <p className="text-xs leading-[1.6] text-[var(--fg-3)]">
        {t('auth.legalPrefix')}{' '}
        <Link href="/about" className="text-[var(--fg-2)] underline hover:text-[var(--fg-1)]">{t('auth.terms')}</Link>{' '}
        {t('auth.legalConjunction')}{' '}
        <Link href="/about" className="text-[var(--fg-2)] underline hover:text-[var(--fg-1)]">{t('auth.privacy')}</Link>.
      </p>
    </div>
  )
}

import { SIGN_IN_BUTTON_HEIGHT } from '@orbit/shared/theme'
import { AppleSignInLogo } from '@/components/auth/apple-sign-in-logo'
import { GoogleMark } from '@/components/auth/google-mark'
import Link from 'next/link'
import type { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

/** The two provider ways in, with the offline reason and the provider failure under them. */
export function LoginProviderActions({ disabled, isGoogleLoading, isAppleLoading, isOnline, error, onSignInWithGoogle, onSignInWithApple, t }: Readonly<{
  disabled: boolean; isGoogleLoading: boolean; isAppleLoading: boolean; isOnline: boolean; error: string | null
  onSignInWithGoogle: () => void; onSignInWithApple: (() => void) | undefined; t: ReturnType<typeof useTranslations>
}>) {
  return <>
    <div className="flex flex-col">
      {/* eslint-disable-next-line local/max-button-words -- Google's approved sign-in wording is required. */}
      <PillButton brand="google" leadingIcon={<GoogleMark />} variant="ghost" disabled={disabled}
        loading={isGoogleLoading} onClick={onSignInWithGoogle}>{t('auth.signInWithGoogle')}</PillButton>
    </div>
    {process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ? <div className="flex flex-col">
      {/* eslint-disable-next-line local/max-button-words -- Apple's approved sign-in wording labels the browser action. */}
      <PillButton brand="apple" variant="ghost" leadingIcon={<AppleSignInLogo height={SIGN_IN_BUTTON_HEIGHT} />} disabled={disabled}
        loading={isAppleLoading} onClick={onSignInWithApple}>{t('auth.signInWithApple')}</PillButton>
    </div> : null}
    {!isOnline && <p className="text-sm text-[var(--fg-3)]">{t('auth.googleOffline')}</p>}
    {error && <p role="alert" className="text-sm text-[var(--status-bad-text)]">{error}</p>}
  </>
}

const LEGAL_LINK_CLASS_WITH_FOCUS_ROOM = 'mx-1 whitespace-nowrap text-[var(--fg-2)] underline hover:text-[var(--fg-1)]'

/** The legal consent line: the one place a person agrees to anything. */
export function LoginLegalConsent({ t }: Readonly<{ t: ReturnType<typeof useTranslations> }>) {
  return (
    <p className="text-xs leading-[2.5] text-[var(--fg-3)]">
      {t.rich('auth.legalConsent', {
        terms: (chunks) => <Link href="/about" className={LEGAL_LINK_CLASS_WITH_FOCUS_ROOM}>{chunks}</Link>,
        privacy: (chunks) => <Link href="/about" className={LEGAL_LINK_CLASS_WITH_FOCUS_ROOM}>{chunks}</Link>,
      })}
    </p>
  )
}

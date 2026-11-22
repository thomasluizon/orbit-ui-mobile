import { AppleSignInButton } from './apple-sign-in-button'
import { GoogleMark } from '@/components/auth/google-mark'
import { Text, View } from 'react-native'
import { Trans } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import type { LoginStyles } from '@/app/login-styles'

/** The two provider ways in, with the offline reason and the provider failure under them. */
export function LoginProviderActions({ disabled, isGoogleLoading, isAppleLoading, isOnline, error, onSignInWithGoogle, onSignInWithApple, styles, t }: Readonly<{
  disabled: boolean; isGoogleLoading: boolean; isAppleLoading: boolean; isOnline: boolean; error: string | null
  onSignInWithGoogle: () => void; onSignInWithApple: () => void; styles: LoginStyles; t: (key: string, params?: Record<string, unknown>) => string
}>) {
  return <>
    <View style={{ width: '100%' }}>
      {/* eslint-disable-next-line local/max-button-words -- Google's approved sign-in wording is required. */}
      <PillButton brand="google" leadingIcon={<GoogleMark />} variant="ghost" onClick={onSignInWithGoogle} disabled={disabled}
        loading={isGoogleLoading}>{t('auth.signInWithGoogle')}</PillButton>
    </View>
    <AppleSignInButton disabled={disabled} loading={isAppleLoading} onPress={onSignInWithApple} />
    {!isOnline && <Text style={styles.reason}>{t('auth.googleOffline')}</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </>
}

/** The legal consent line: the one place a person agrees to anything. */
export function LoginLegalConsent({ styles, onOpenTerms, onOpenPrivacy }: Readonly<{ styles: LoginStyles; onOpenTerms: () => void; onOpenPrivacy: () => void }>) {
  return (
    <Text style={styles.legal}>
      <Trans i18nKey="auth.legalConsent" components={{
        terms: <Text accessibilityRole="link" style={styles.legalLink} onPress={onOpenTerms} />,
        privacy: <Text accessibilityRole="link" style={styles.legalLink} onPress={onOpenPrivacy} />,
      }} />
    </Text>
  )
}

import { Text, View } from 'react-native'
import { WifiOff } from '@/components/ui/icons'
import type { AppTokensV2 } from '@/lib/theme'
import type { LoginStyles } from '@/app/login-styles'

type Translate = (key: string, params?: Record<string, unknown>) => string

export function ReferralBanner({ t, styles }: Readonly<{ t: Translate; styles: LoginStyles }>) {
  return <View accessibilityLiveRegion="polite" style={styles.referralBanner}>
    <View style={styles.hairline} />
    <Text style={styles.referralBannerText}>{t('referral.loginBanner')}</Text>
    <View style={styles.hairline} />
  </View>
}

export function LoginSuccessMessage({ message, styles }: Readonly<{ message: string | null; styles: LoginStyles }>) {
  return <Text style={styles.successText} accessibilityLiveRegion="polite">{message}</Text>
}

export function LoginOfflineNotice({ t, styles, tokens }: Readonly<{ t: Translate; styles: LoginStyles; tokens: AppTokensV2 }>) {
  return <View style={styles.offlineNotice} accessibilityLiveRegion="polite" testID="offline-notice">
    <WifiOff size={20} color={tokens.fg3} accessible={false} />
    <Text style={styles.offlineText}>{t('auth.errors.offline')}</Text>
  </View>
}

export function LoginValidationMessage({ message, isOnline, styles }: Readonly<{ message?: string; isOnline: boolean; styles: LoginStyles }>) {
  const visibleMessage = isOnline ? message : undefined
  return <View accessibilityLiveRegion="polite" style={visibleMessage ? undefined : styles.hiddenLiveRegion}>
    {visibleMessage ? <Text style={styles.error}>{visibleMessage}</Text> : null}
  </View>
}

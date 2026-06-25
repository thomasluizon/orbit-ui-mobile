import { Text, View } from 'react-native'
import { AppLogo } from '@/components/ui/app-logo'
import type { LoginStyles } from './login-styles'

type LoginStep = 'email' | 'code'
type TranslationFn = (key: string, params?: Record<string, unknown>) => string

interface LoginHeaderProps {
  step: LoginStep
  t: TranslationFn
  styles: LoginStyles
}

export function LoginHeader({ step, t, styles }: Readonly<LoginHeaderProps>) {
  return (
    <>
      <View style={styles.brandingHeader}>
        <AppLogo size={64} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.stepTitle}>
          {step === 'email' ? t('auth.signIn') : t('auth.enterCode')}
        </Text>
        {step === 'email' && (
          <Text style={styles.stepSubtitle}>{t('auth.signInSubtitle')}</Text>
        )}
      </View>
    </>
  )
}

interface ReferralBannerProps {
  t: TranslationFn
  styles: LoginStyles
}

export function ReferralBanner({ t, styles }: Readonly<ReferralBannerProps>) {
  return (
    <View style={styles.referralBanner}>
      <Text style={styles.referralBannerText}>{t('referral.loginBanner')}</Text>
    </View>
  )
}

interface LoginSuccessMessageProps {
  message: string
  styles: LoginStyles
}

export function LoginSuccessMessage({
  message,
  styles,
}: Readonly<LoginSuccessMessageProps>) {
  return <Text style={styles.successText}>{message}</Text>
}

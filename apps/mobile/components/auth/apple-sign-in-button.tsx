import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SIGN_IN_BUTTON_HEIGHT } from '@orbit/shared/theme'
import { isAppleAuthConfigured } from '@/lib/apple-auth'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from '@/components/ui/pill-button'
import { AppleSignInLogo } from './apple-sign-in-logo'

/**
 * Every platform draws the same custom button, which Apple's Human Interface Guidelines allow for Sign in with Apple.
 * It shares the Google pill's component, so both titles use one font and one size. Apple's system control on iOS sets its own title size, which the app cannot change.
 * The pill is a button element that names itself from its title and carries the busy and disabled state for VoiceOver and TalkBack.
 */
export function AppleSignInButton({ disabled, loading, onPress }: Readonly<{
  disabled: boolean; loading: boolean; onPress: () => void
}>) {
  const { t } = useTranslation()
  const { currentTheme } = useAppTheme()
  if (!isAppleAuthConfigured()) return null
  // eslint-disable-next-line local/max-button-words -- Apple's approved sign-in wording labels the sign-in action.
  return <View style={{ width: '100%' }}><PillButton brand="apple" variant="ghost" leadingIcon={<AppleSignInLogo theme={currentTheme} size={SIGN_IN_BUTTON_HEIGHT} />} disabled={disabled} loading={loading} onClick={onPress}>{t('auth.signInWithApple')}</PillButton></View>
}

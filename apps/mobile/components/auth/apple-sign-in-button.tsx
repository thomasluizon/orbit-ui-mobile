import { Platform, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppleAuthenticationButton, AppleAuthenticationButtonStyle, AppleAuthenticationButtonType } from 'expo-apple-authentication'
import { BUTTON_SIZES, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { isAppleAuthConfigured } from '@/lib/apple-auth'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from '@/components/ui/pill-button'
import { AppleSignInLogo } from './apple-sign-in-logo'

/** The Google pill's visible height. Apple's rules size the title and the logo file from the button height. */
const BUTTON_HEIGHT = Math.max(BUTTON_SIZES.sm.height, SMALL_PILL_VISIBLE_MIN)

export function AppleSignInButton({ disabled, loading, onPress }: Readonly<{
  disabled: boolean; loading: boolean; onPress: () => void
}>) {
  const { t } = useTranslation()
  const { currentTheme } = useAppTheme()
  if (!isAppleAuthConfigured()) return null
  if (Platform.OS === 'ios') return <View style={{ width: '100%', opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
    <AppleAuthenticationButton buttonType={AppleAuthenticationButtonType.CONTINUE} cornerRadius={BUTTON_HEIGHT / 2}
      buttonStyle={currentTheme === 'dark' ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK}
      onPress={() => { if (!disabled) onPress() }} style={{ width: '100%', height: BUTTON_HEIGHT }} />
  </View>
  // eslint-disable-next-line local/max-button-words -- Apple's approved sign-in wording labels the browser action.
  return <View style={{ width: '100%' }}><PillButton brand="apple" variant="ghost" leadingIcon={<AppleSignInLogo theme={currentTheme} size={BUTTON_HEIGHT} />} disabled={disabled} loading={loading} onClick={onPress}>{t('auth.signInWithApple')}</PillButton></View>
}

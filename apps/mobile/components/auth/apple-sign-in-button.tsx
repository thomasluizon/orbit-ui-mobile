import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isAppleAuthConfigured } from '@/lib/apple-auth'
import { AppleMark } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'

export function AppleSignInButton({ disabled, loading, onPress }: Readonly<{
  disabled: boolean; loading: boolean; onPress: () => void
}>) {
  const { t } = useTranslation()
  if (!isAppleAuthConfigured()) return null
  // eslint-disable-next-line local/max-button-words -- Apple's approved sign-in wording labels the action.
  return <View style={{ width: '100%' }}><PillButton variant="ghost" leadingIcon={<AppleMark size={20} accessible={false} />} disabled={disabled} loading={loading} onClick={onPress}>{t('auth.signInWithApple')}</PillButton></View>
}

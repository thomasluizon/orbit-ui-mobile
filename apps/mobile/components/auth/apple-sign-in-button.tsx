import { lazy, Suspense } from 'react'
import { Platform, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isAppleAuthConfigured } from '@/lib/apple-auth'
import { AppleMark } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'

const NativeAppleSignInButton = lazy(() => import('./native-apple-sign-in-button').then((module) => ({ default: module.NativeAppleSignInButton })))

export function AppleSignInButton({ disabled, loading, onPress }: Readonly<{
  disabled: boolean; loading: boolean; onPress: () => void
}>) {
  const { t } = useTranslation()
  if (!isAppleAuthConfigured()) return null
  // eslint-disable-next-line local/max-button-words -- Apple's approved sign-in wording labels the browser action.
  if (Platform.OS !== 'ios') return <View style={{ width: '100%' }}><PillButton variant="ghost" leadingIcon={<AppleMark size={20} accessible={false} />} disabled={disabled} loading={loading} onClick={onPress}>{t('auth.signInWithApple')}</PillButton></View>
  return <Suspense fallback={null}><NativeAppleSignInButton disabled={disabled} loading={loading} onPress={onPress} /></Suspense>
}

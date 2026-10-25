import { useEffect, useState } from 'react'
import { captureError } from '@/lib/sentry'
import { View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'

export function NativeAppleSignInButton({ disabled, loading, onPress }: Readonly<{
  disabled: boolean; loading: boolean; onPress: () => void
}>) {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let active = true
    void AppleAuthentication.isAvailableAsync().then((supported) => { if (active) setAvailable(supported) }, captureError)
    return () => { active = false }
  }, [])
  if (!available) return null
  return <View pointerEvents={disabled ? 'none' : 'auto'} accessibilityState={{ disabled, busy: loading }} style={{ width: '100%', opacity: disabled ? 0.4 : 1 }}>
    <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE} cornerRadius={24}
      onPress={() => { if (!disabled) onPress() }} style={{ height: 48, width: '100%' }} />
  </View>
}

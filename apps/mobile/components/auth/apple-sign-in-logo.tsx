import { Image } from 'react-native'
import type { ThemeMode } from '@orbit/shared/types/profile'
import logoOnBlack from '@/assets/auth/apple-sign-in-logo-on-black.png'
import logoOnWhite from '@/assets/auth/apple-sign-in-logo-on-white.png'

/**
 * Apple's logo from https://appleid.cdn-apple.com/appleid/button/logo (size 44, no border, scales 1 to 4),
 * the button endpoint Apple documents for apps without its JavaScript framework. The file is as tall as the button.
 */
const LOGO_BY_THEME: Record<ThemeMode, number> = { dark: logoOnWhite, light: logoOnBlack }

export function AppleSignInLogo({ theme, size }: Readonly<{ theme: ThemeMode; size: number }>) {
  return <Image source={LOGO_BY_THEME[theme]} accessible={false} testID="apple-sign-in-logo" style={{ width: size, height: size }} />
}

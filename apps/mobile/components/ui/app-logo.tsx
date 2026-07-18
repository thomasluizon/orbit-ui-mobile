// react-doctor-disable-next-line rn-prefer-expo-image -- static bundled asset via require(); no remote fetch or cache benefit from expo-image, so RN Image is the lighter primitive https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Image, type ImageSourcePropType } from 'react-native'
import type { LucideProps } from '@/components/ui/icons'

/**
 * The Orbit logo image. Replaces the procedural Saturn glyph.
 * Accepts `LucideProps` so it can stand in as an `AppBar` `LeadingIcon`; only `size` is used.
 */
export function AppLogo({ size = 32 }: Readonly<LucideProps>) {
  const dimension = typeof size === 'number' ? size : Number(size)
  return (
    <Image
      source={require('../../assets/logo-no-bg.png') as ImageSourcePropType}
      style={{ width: dimension, height: dimension }}
      resizeMode="contain"
    />
  )
}

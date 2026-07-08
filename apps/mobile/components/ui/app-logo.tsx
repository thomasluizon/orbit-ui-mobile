import { Image, type ImageSourcePropType } from 'react-native'
import type { LucideProps } from 'lucide-react-native'

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

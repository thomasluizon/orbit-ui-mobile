import { useMemo } from 'react'
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface AstraMarkAdapterProps {
  size?: string | number
  color?: ColorValue
}

/** @deprecated Use AstraGlyph directly outside legacy Tabler icon slots. */
export function AstraMark({ size = 24, color }: Readonly<AstraMarkAdapterProps>) {
  return (
    <AstraGlyph
      size={typeof size === 'number' ? size : Number(size)}
      color={typeof color === 'string' ? color : undefined}
    />
  )
}

interface AstraAvatarProps {
  size?: number
  label?: string
  style?: StyleProp<ViewStyle>
}

export function AstraAvatar({ size = 116, label, style }: Readonly<AstraAvatarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const decorative = label == null

  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={label}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tintFromPrimary(tokens, 0.14),
        },
        style,
      ]}
    >
      <AstraGlyph size={Math.round(size * 0.5)} color={tokens.primary} />
    </View>
  )
}

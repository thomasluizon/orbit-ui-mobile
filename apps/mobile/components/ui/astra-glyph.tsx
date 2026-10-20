import {
  ASTRA_GLYPH_16_PATHS,
  ASTRA_GLYPH_PATHS,
  type AstraGlyphProps,
} from '@orbit/shared/contracts/brand'
import { useMemo } from 'react'
import Svg, { Path } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function AstraGlyph({ size = 24, color }: Readonly<AstraGlyphProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const isNativeSize = size < 20
  const paths = isNativeSize ? ASTRA_GLYPH_16_PATHS : ASTRA_GLYPH_PATHS

  return (
    <Svg
      width={size}
      height={size}
      viewBox={isNativeSize ? '0 0 16 16' : '0 0 1024 1024'}
      fill="none"
      color={color ?? tokens.fg1}
      accessible={false}
      testID={isNativeSize ? 'astra-mark-16' : 'astra-mark'}
    >
      {paths.map((path) => (
        <Path key={path.d} d={path.d} fill="currentColor" fillRule={path.fillRule} />
      ))}
    </Svg>
  )
}

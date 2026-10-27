import {
  ASTRA_GLYPH_VIEW_BOX,
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
  return (
    <Svg
      width={size}
      height={size}
      viewBox={ASTRA_GLYPH_VIEW_BOX}
      fill="none"
      color={color ?? tokens.fg1}
      accessible={false}
      testID="astra-mark"
    >
      {ASTRA_GLYPH_PATHS.map((path) => (
        <Path key={path.d} d={path.d} fill="currentColor" fillRule={path.fillRule} />
      ))}
    </Svg>
  )
}

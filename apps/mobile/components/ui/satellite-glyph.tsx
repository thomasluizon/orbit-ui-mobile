import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SatelliteGlyphProps {
  size?: number
}

/** Kit satellite empty-state glyph: a planet ring with a small satellite riding the primary
 *  sweep arc, plus accent star dots. */
export function SatelliteGlyph({ size = 96 }: Readonly<SatelliteGlyphProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Circle cx={46} cy={48} r={24} stroke={tokens.fg4} strokeWidth={2.5} />
      <Path
        d="M46 24 a24 24 0 0 1 24 24"
        stroke={tokens.primary}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={46} cy={48} r={6} fill={tokens.fg3} />
      <Rect x={65} y={43} width={10} height={10} rx={2.5} stroke={tokens.primary} strokeWidth={2.5} />
      <Circle cx={78} cy={20} r={2} fill={tokens.primarySoft} />
      <Circle cx={16} cy={72} r={1.6} fill={tokens.primarySoft} />
    </Svg>
  )
}

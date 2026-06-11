import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SatelliteGlyphProps {
  size?: number
}

/** Kit satellite empty-state glyph: muted orbiter with a primary arc and accent star dots. */
export function SatelliteGlyph({ size = 96 }: Readonly<SatelliteGlyphProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Circle cx={34} cy={34} r={19} stroke={tokens.fg4} strokeWidth={2.5} />
      <Path
        d="M34 21 a13 13 0 0 1 13 13"
        stroke={tokens.primary}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={34} cy={34} r={5} fill={tokens.fg3} />
      <Rect
        x={52}
        y={52}
        width={22}
        height={13}
        rx={2.5}
        rotation={45}
        origin="63, 58"
        stroke={tokens.fg4}
        strokeWidth={2.5}
      />
      <Path d="M63 70 L63 84" stroke={tokens.fg4} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M56 84 L70 84" stroke={tokens.fg4} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={74} cy={22} r={2} fill={tokens.primarySoft} />
      <Circle cx={20} cy={68} r={1.6} fill={tokens.primarySoft} />
    </Svg>
  )
}

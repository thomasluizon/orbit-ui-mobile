import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ParentRingProps {
  done: number
  total: number
  /** Ring diameter in px (default 12 per v8 spec). */
  size?: number
  /** Progress stroke color (defaults to `primary`). */
  color?: string
}

/** v8 small progress ring (no inner text) showing child completion ratio. */
export function ParentRing({ done, total, size = 12, color }: Readonly<ParentRingProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const pct = total > 0 ? Math.min(1, done / total) : 0
  const r = (size - 1.5) / 2
  const c = 2 * Math.PI * r
  const dashArc = c * pct

  return (
    <View
      style={{
        width: size,
        height: size,
      }}
    >
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tokens.hairlineStrong}
          strokeWidth={1.5}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? tokens.primary}
          strokeWidth={1.5}
          strokeDasharray={`${dashArc} ${c}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  )
}

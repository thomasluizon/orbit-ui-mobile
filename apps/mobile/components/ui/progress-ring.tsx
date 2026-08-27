import type { ProgressRingProps } from '@orbit/shared/contracts/display'
import Svg, { Circle } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A circular progress sweep over a neutral track. */
export function ProgressRing({ value = 0, size = 64, label }: Readonly<ProgressRingProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const clamped = Math.min(100, Math.max(0, value))
  const complete = clamped === 100
  const strokeWidth = Math.max(2, size / 16)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      testID={complete ? 'progress-ring-complete' : 'progress-ring-unfinished'}
    >
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tokens.fg4} strokeWidth={strokeWidth} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={complete ? tokens.fg3 : tokens.primary}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  )
}

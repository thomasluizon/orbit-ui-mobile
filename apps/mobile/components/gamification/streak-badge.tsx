import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Line } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { plural } from '@/lib/plural'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

/**
 * v8 streak badge — hairline pill with outline flame + tabular streak count.
 * No tier colors, no gradients, no glows. Active streak (>=2) strokes the
 * flame in status-bad; otherwise fg-3. Frozen state swaps to a snowflake
 * stroked by status-frozen.
 */
export function StreakBadge({ streak, isFrozen }: Readonly<StreakBadgeProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  if (streak <= 0) return null

  const active = streak >= 2
  const strokeColor = isFrozen
    ? tokens.statusFrozen
    : active
      ? tokens.statusBad
      : tokens.fg3

  return (
    <View
      accessibilityLabel={plural(
        t('streakDisplay.badge.tooltip', { count: streak }),
        streak,
      )}
      style={[styles.badge, { borderColor: tokens.hairlineStrong }]}
    >
      {isFrozen ? (
        <Svg width={11} height={12} viewBox="0 0 12 14" fill="none">
          <Line x1={6} y1={0} x2={6} y2={14} stroke={strokeColor} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={2} y1={2} x2={6} y2={6} stroke={strokeColor} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={10} y1={2} x2={6} y2={6} stroke={strokeColor} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={2} y1={12} x2={6} y2={8} stroke={strokeColor} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={10} y1={12} x2={6} y2={8} stroke={strokeColor} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={0} y1={7} x2={12} y2={7} stroke={strokeColor} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      ) : (
        <Svg width={11} height={12} viewBox="0 0 24 24" fill="none">
          <Path
            d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            stroke={strokeColor}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}

      <Text style={[styles.count, { color: tokens.fg1 }]}>{streak}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
  },
  count: {
    fontFamily: 'GeistMono',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})

import { type GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native'
import Svg, { Line } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { plural } from '@/lib/plural'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

/**
 * Kit streak entry point — 40px circled button (1.5px hairline-strong ring,
 * translucent well) with the 🔥 flame emoji and a tabular count. Frozen state
 * swaps the flame for a snowflake stroked in status-frozen. Tapping navigates
 * to the streak page; the press stops propagation so the Today header's
 * go-to-today Pressable does not fire.
 */
export function StreakBadge({ streak, isFrozen }: Readonly<StreakBadgeProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  if (streak <= 0) return null

  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation()
    router.push('/streak')
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={plural(
        t('streakDisplay.badge.tooltip', { count: streak }),
        streak,
      )}
      onPress={handlePress}
      style={[
        styles.badge,
        {
          borderColor: tokens.hairlineStrong,
          backgroundColor: tokens.bgField,
        },
      ]}
    >
      {isFrozen ? (
        <Svg width={12} height={14} viewBox="0 0 12 14" fill="none">
          <Line x1={6} y1={0} x2={6} y2={14} stroke={tokens.statusFrozen} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={2} y1={2} x2={6} y2={6} stroke={tokens.statusFrozen} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={10} y1={2} x2={6} y2={6} stroke={tokens.statusFrozen} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={2} y1={12} x2={6} y2={8} stroke={tokens.statusFrozen} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={10} y1={12} x2={6} y2={8} stroke={tokens.statusFrozen} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={0} y1={7} x2={12} y2={7} stroke={tokens.statusFrozen} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      ) : (
        <Text style={styles.flame} accessibilityElementsHidden>
          🔥
        </Text>
      )}

      <Text style={[styles.count, { color: tokens.fg1 }]}>{streak}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 40,
    height: 40,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  flame: {
    fontSize: 15,
    lineHeight: 18,
  },
  count: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
})

import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
} from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { plural } from '@/lib/plural'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

// ---------------------------------------------------------------------------
// Tier colors
// ---------------------------------------------------------------------------

function tierStyles(tier: string): { bg: string; border: string } {
  switch (tier) {
    case 'legendary':
      return { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.30)' }
    case 'intense':
      return { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.30)' }
    case 'strong':
      return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)' }
    default:
      return { bg: colors.surfaceElevated, border: colors.border }
  }
}

function tierCountColor(tier: string): string {
  switch (tier) {
    case 'legendary':
      return '#fbbf24'
    case 'intense':
      return '#f97316'
    case 'strong':
      return '#ef4444'
    default:
      return colors.textSecondary
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreakBadge({ streak, isFrozen }: Readonly<StreakBadgeProps>) {
  const { t } = useTranslation()

  const tier = useMemo(() => {
    if (streak >= 100) return 'legendary'
    if (streak >= 30) return 'intense'
    if (streak >= 7) return 'strong'
    return 'normal'
  }, [streak])

  if (streak <= 0) return null

  const ts = tierStyles(tier)
  const countColor = tierCountColor(tier)

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: ts.bg, borderColor: ts.border },
      ]}
      accessibilityLabel={plural(
        t('streakDisplay.badge.tooltip', { count: streak }),
        streak,
      )}
    >
      {/* Flame icon */}
      <Svg width={12} height={15} viewBox="0 0 16 20" fill="none">
        <Defs>
          <LinearGradient
            id="flame-grad"
            x1="8"
            y1="0"
            x2="8"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#fbbf24" />
            <Stop offset="0.5" stopColor="#f97316" />
            <Stop offset="1" stopColor="#ef4444" />
          </LinearGradient>
        </Defs>
        <Path
          d="M8 0C8 0 2 6.5 2 12a6 6 0 0 0 12 0C14 6.5 8 0 8 0Zm0 17a3 3 0 0 1-3-3c0-2 3-5.5 3-5.5S11 12 11 14a3 3 0 0 1-3 3Z"
          fill="url(#flame-grad)"
        />
      </Svg>

      {/* Count */}
      <Text style={[styles.count, { color: countColor }]}>{streak}</Text>

      {/* Frozen indicator */}
      {isFrozen ? (
        <View style={styles.frozenIcon}>
          <Svg width={10} height={12} viewBox="0 0 12 14" fill="none">
            <Line
              x1={6}
              y1={0}
              x2={6}
              y2={14}
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={2}
              y1={2}
              x2={6}
              y2={6}
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={10}
              y1={2}
              x2={6}
              y2={6}
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={2}
              y1={12}
              x2={6}
              y2={8}
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={10}
              y1={12}
              x2={6}
              y2={8}
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={0}
              y1={7}
              x2={12}
              y2={7}
              stroke="#93c5fd"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
  frozenIcon: {
    marginLeft: 1,
  },
})

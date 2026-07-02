import { StyleSheet, Text, View } from 'react-native'
import { SkeletonLine } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import type { createTokensV2 } from '@/lib/theme'

type TranslationFn = (key: string, values?: Record<string, unknown>) => string

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

interface HabitDetailStatsRowProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  isBadHabit?: boolean
  t: TranslationFn
  tokens: ReturnType<typeof createTokensV2>
}

/** Kit StatTile row for the habit detail: streak, longest streak, monthly rate. */
export function HabitDetailStatsRow({
  metrics,
  loading,
  isBadHabit = false,
  t,
  tokens,
}: Readonly<HabitDetailStatsRowProps>) {
  if (metrics && !loading) {
    return (
      <View style={rowStyles.tilesRow}>
        <StatTile
          emoji={isBadHabit ? '🛡️' : '🔥'}
          value={String(metrics.currentStreak)}
          label={
            isBadHabit
              ? t('habits.detail.daysFree')
              : t('habits.detail.currentStreak')
          }
        />
        <StatTile
          emoji="🏆"
          value={String(metrics.longestStreak)}
          label={t('habits.detail.longestStreak')}
        />
        <StatTile
          emoji="📈"
          value={`${Math.round(metrics.monthlyCompletionRate)}%`}
          label={t('habits.detail.monthlyRate')}
        />
      </View>
    )
  }

  if (!metrics && loading) {
    return (
      <View style={rowStyles.tilesRow}>
        {[1, 2, 3].map((i) => (
          <SkeletonLine
            key={i}
            height={110}
            style={[
              rowStyles.skeletonTile,
              {
                backgroundColor: tokens.bgField,
                borderColor: tokens.hairline,
              },
            ]}
          />
        ))}
      </View>
    )
  }

  return (
    <Text
      style={[
        rowStyles.empty,
        { color: tokens.fg3, borderBottomColor: tokens.hairline },
      ]}
    >
      {t('habits.detail.noDataYet')}
    </Text>
  )
}

const rowStyles = StyleSheet.create({
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  skeletonTile: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
  },
  empty: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    textAlign: 'center',
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})

import { StyleSheet, Text, View } from 'react-native'
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
  t: TranslationFn
  tokens: ReturnType<typeof createTokensV2>
}

export function HabitDetailStatsRow({
  metrics,
  loading,
  t,
  tokens,
}: Readonly<HabitDetailStatsRowProps>) {
  if (metrics && !loading) {
    const items: { label: string; value: string }[] = [
      {
        label: t('habits.detail.currentStreak'),
        value: String(metrics.currentStreak),
      },
      {
        label: t('habits.detail.longestStreak'),
        value: String(metrics.longestStreak),
      },
      {
        label: t('habits.detail.monthlyRate'),
        value: `${Math.round(metrics.monthlyCompletionRate)}%`,
      },
    ]
    return (
      <View
        style={[
          rowStyles.row,
          { borderBottomColor: tokens.hairline },
        ]}
      >
        {items.map((item) => (
          <View key={item.label} style={rowStyles.cell}>
            <Text style={[rowStyles.label, { color: tokens.fg3 }]}>
              {item.label}
            </Text>
            <Text style={[rowStyles.value, { color: tokens.fg1 }]}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  if (!metrics && loading) {
    return (
      <View
        style={[
          rowStyles.row,
          { borderBottomColor: tokens.hairline },
        ]}
      >
        {[1, 2, 3].map((i) => (
          <View key={i} style={rowStyles.cell}>
            <View
              style={[
                rowStyles.skeletonLabel,
                { backgroundColor: tokens.hairlineStrong },
              ]}
            />
            <View
              style={[
                rowStyles.skeletonValue,
                { backgroundColor: tokens.hairlineStrong },
              ]}
            />
          </View>
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
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 11,
    },
  value: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 24,
    letterSpacing: -0.48,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  skeletonLabel: {
    width: 60,
    height: 11,
    borderRadius: 4,
    opacity: 0.5,
  },
  skeletonValue: {
    width: 40,
    height: 24,
    borderRadius: 4,
    opacity: 0.5,
  },
  empty: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    textAlign: 'center',
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    fontStyle: 'italic',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})

import { BarChart3, Flame, Trophy } from 'lucide-react-native'
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

type TranslationFn = (key: string, values?: Record<string, unknown>) => string

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

export interface HabitDetailSectionStyles {
  statsGrid: ViewStyle
  statCard: ViewStyle
  statLabel: TextStyle
  statValue: TextStyle
  skeletonIcon: ViewStyle
  skeletonLabel: ViewStyle
  skeletonValue: ViewStyle
  sectionTitle: TextStyle
  buttonRow: ViewStyle
  editButton: ViewStyle
  editButtonText: TextStyle
  deleteButton: ViewStyle
  deleteButtonText: TextStyle
  noDataText?: TextStyle
}

interface HabitDetailStatsGridProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  t: TranslationFn
  colors: {
    primary: string
    surfaceGround: string
    borderMuted: string
    textSecondary: string
    textPrimary: string
    textMuted: string
  }
  styles: Pick<
    HabitDetailSectionStyles,
    | 'statsGrid'
    | 'statCard'
    | 'statLabel'
    | 'statValue'
    | 'skeletonIcon'
    | 'skeletonLabel'
    | 'skeletonValue'
    | 'sectionTitle'
    | 'noDataText'
  >
}

/**
 * Legacy v1 stats grid kept for tests / any v1 surfaces not yet migrated.
 * The v8 Habit Detail Drawer renders `HabitDetailStatsRow` instead.
 */
export function HabitDetailStatsGrid({
  metrics,
  loading,
  t,
  colors,
  styles,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics && !loading) {
    return (
      <View>
        <Text style={styles.sectionTitle}>{t('habits.detail.stats')}</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Flame size={20} color={colors.primary} />
            <Text style={styles.statLabel}>
              {t('habits.detail.currentStreak')}
            </Text>
            <Text style={styles.statValue}>
              {t('habits.detail.streakDays', { n: metrics.currentStreak })}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Trophy size={20} color={colors.primary} />
            <Text style={styles.statLabel}>
              {t('habits.detail.longestStreak')}
            </Text>
            <Text style={styles.statValue}>
              {t('habits.detail.streakDays', { n: metrics.longestStreak })}
            </Text>
          </View>
          <View style={styles.statCard}>
            <BarChart3 size={20} color={colors.primary} />
            <Text style={styles.statLabel}>
              {t('habits.detail.monthlyRate')}
            </Text>
            <Text style={styles.statValue}>
              {Math.round(metrics.monthlyCompletionRate)}%
            </Text>
          </View>
        </View>
      </View>
    )
  }

  if (!metrics && loading) {
    return (
      <View>
        <Text style={styles.sectionTitle}>{t('habits.detail.stats')}</Text>
        <View style={styles.statsGrid}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.statCard}>
              <View style={styles.skeletonIcon} />
              <View style={styles.skeletonLabel} />
              <View style={styles.skeletonValue} />
            </View>
          ))}
        </View>
      </View>
    )
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('habits.detail.stats')}</Text>
      <Text
        style={[
          styles.noDataText,
          {
            color: colors.textMuted,
            textAlign: 'center',
            paddingVertical: 8,
          },
        ]}
      >
        {t('habits.detail.noDataYet')}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// v8 stats row: three column mono numbers + plain labels, hairline below.
// ---------------------------------------------------------------------------

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
    fontFamily: 'Geist',
    fontSize: 11,
    fontWeight: '500',
  },
  value: {
    fontFamily: 'GeistMono',
    fontSize: 24,
    fontWeight: '500',
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
    fontFamily: 'Geist',
    fontSize: 13,
    fontStyle: 'italic',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})

import { BarChart3, Flame, Trophy } from 'lucide-react-native'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'

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
    'statsGrid' | 'statCard' | 'statLabel' | 'statValue' | 'skeletonIcon' | 'skeletonLabel' | 'skeletonValue' | 'sectionTitle' | 'noDataText'
  >
}

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
              {t('habits.detail.streakDays', {
                n: metrics.currentStreak,
              })}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Trophy size={20} color={colors.primary} />
            <Text style={styles.statLabel}>
              {t('habits.detail.longestStreak')}
            </Text>
            <Text style={styles.statValue}>
              {t('habits.detail.streakDays', {
                n: metrics.longestStreak,
              })}
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

  // metrics is null and not loading
  return (
    <View>
      <Text style={styles.sectionTitle}>{t('habits.detail.stats')}</Text>
      <Text style={[styles.noDataText, { color: colors.textMuted, textAlign: 'center', paddingVertical: 8 }]}>
        {t('habits.detail.noDataYet')}
      </Text>
    </View>
  )
}


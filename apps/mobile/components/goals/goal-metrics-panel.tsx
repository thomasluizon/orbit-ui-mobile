import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

type AppColors = {
  primary: string
  primary_10: string
  white: string
  textMuted: string
  textSecondary: string
  textPrimary: string
  surface: string
  surfaceElevated: string
  borderMuted: string
  amber400: string
  amber500: string
  red400: string
  red500: string
  green400: string
  green500: string
  surfaceGround: string
}
const goalRadius = {
  sm: 8,
  lg: 16,
  xl: 20,
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalMetricsPanel({
  metrics,
  unit,
  isLoading,
  isStreak = false,
}: GoalMetricsPanelProps) {
  const { t, i18n } = useTranslation()
  const { colors } = useAppTheme()
  const locale = i18n.language
  const styles = useMemo(() => createStyles(colors), [colors])

  const statusConfig = useMemo(() => {
    const presentation = getGoalMetricsStatusPresentation(metrics?.trackingStatus)
    if (!presentation) return null

    switch (presentation.tone) {
      case 'success':
        return {
          label: t(presentation.labelKey),
          bg: 'rgba(34, 197, 94, 0.10)',
          text: colors.green400,
          dot: colors.green500,
        }
      case 'warning':
        return {
          label: t(presentation.labelKey),
          bg: 'rgba(245, 158, 11, 0.10)',
          text: colors.amber400,
          dot: colors.amber500,
        }
      case 'danger':
        return {
          label: t(presentation.labelKey),
          bg: 'rgba(248, 113, 113, 0.10)',
          text: colors.red400,
          dot: colors.red500,
        }
      case 'muted':
        return {
          label: t(presentation.labelKey),
          bg: colors.surfaceElevated,
          text: colors.textSecondary,
          dot: colors.textMuted,
        }
      default:
        return null
    }
  }, [colors, metrics?.trackingStatus, t])

  function formatMetricDate(dateStr: string) {
    return formatGoalMetricsDate(dateStr, locale)
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonBadge} />
        <View style={styles.statsGrid}>
          <View style={styles.skeletonStat} />
          <View style={styles.skeletonStat} />
        </View>
      </View>
    )
  }

  if (!metrics) return null

  // Days remaining for streak goals
  const daysRemaining =
    isStreak &&
    metrics.daysToDeadline != null &&
    metrics.daysToDeadline > 0
      ? metrics.daysToDeadline
      : null

  return (
    <View style={styles.container}>
      {/* Tracking Status Badge */}
      {statusConfig && (
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusConfig.dot }]} />
          <Text style={[styles.statusText, { color: statusConfig.text }]}>
            {statusConfig.label}
          </Text>
        </View>
      )}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {/* Projected Completion */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>
            {t('goals.metrics.projectedCompletion')}
          </Text>
          <Text style={styles.statValue}>
            {metrics.projectedCompletionDate
              ? formatMetricDate(metrics.projectedCompletionDate)
              : t('goals.metrics.noData')}
          </Text>
        </View>

        {/* For streak goals: days remaining. For standard: velocity */}
        {isStreak ? (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              {t('goals.metrics.daysToDeadline')}
            </Text>
            <Text style={[styles.statValue, daysRemaining !== null && styles.statValueAmber]}>
              {daysRemaining !== null
                ? t('goals.streak.daysRemaining', { count: daysRemaining })
                : t('goals.metrics.noData')}
            </Text>
          </View>
        ) : (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              {t('goals.metrics.velocity')}
            </Text>
            <Text style={styles.statValue}>
              {metrics.velocityPerDay > 0
                ? `${metrics.velocityPerDay} ${unit}/${t('goals.metrics.perDay')}`
                : t('goals.metrics.noData')}
            </Text>
          </View>
        )}
      </View>

      {/* Linked Habit Adherence */}
      {metrics.habitAdherence.length > 0 && (
        <View>
          <Text style={styles.adherenceTitle}>
            {t('goals.metrics.habitAdherence')}
          </Text>
          <View style={styles.adherenceList}>
            {metrics.habitAdherence.map((habit) => {
              const adherenceTone = getGoalHabitAdherenceTone(
                habit.weeklyCompletionRate,
              )
              const barColor =
                adherenceTone === 'success'
                  ? colors.green500
                  : adherenceTone === 'primary'
                    ? colors.primary
                    : colors.amber500

              return (
                <View key={habit.habitId} style={styles.adherenceCard}>
                  <View style={styles.adherenceContent}>
                    <Text
                      style={styles.adherenceHabitTitle}
                      numberOfLines={1}
                    >
                      {habit.habitTitle}
                    </Text>
                    <View style={styles.adherenceBarRow}>
                      <View style={styles.adherenceBarBg}>
                        <View
                          style={[
                            styles.adherenceBarFill,
                            {
                              width: `${Math.min(100, habit.weeklyCompletionRate)}%`,
                              backgroundColor: barColor,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.adherencePercent}>
                        {Math.round(habit.weeklyCompletionRate)}%
                      </Text>
                    </View>
                  </View>
                  {habit.currentStreak > 0 && (
                    <View style={styles.streakBadge}>
                      <Text style={styles.streakText}>
                        {t('habits.detail.streakDays', { n: habit.currentStreak })}
                      </Text>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    gap: 16,
    paddingVertical: 16,
  },

  // Skeleton
  skeletonBadge: {
    height: 32,
    backgroundColor: colors.surfaceElevated,
    borderRadius: goalRadius.xl,
  },
  skeletonStat: {
    height: 64,
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: goalRadius.xl,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: goalRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: goalRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 4,
  },
  statValueAmber: {
    color: colors.amber400,
  },

  // Habit adherence
  adherenceTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  adherenceList: {
    gap: 8,
  },
  adherenceCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: goalRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderMuted,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  adherenceContent: {
    flex: 1,
    minWidth: 0,
  },
  adherenceHabitTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  adherenceBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  adherenceBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  adherenceBarFill: {
    height: '100%',
    borderRadius: 9999,
  },
  adherencePercent: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  streakBadge: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: goalRadius.sm,
    backgroundColor: colors.primary_10,
  },
  streakText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  })
}

import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import type { GoalMetrics } from '@orbit/shared/types/goal'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalMetricsPanelProps {
  metrics: GoalMetrics | null
  unit: string
  isLoading: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalMetricsPanel({
  metrics,
  unit,
  isLoading,
}: GoalMetricsPanelProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  const statusConfig = useMemo(() => {
    const status = metrics?.trackingStatus
    switch (status) {
      case 'on_track':
        return {
          label: t('goals.metrics.onTrack'),
          bg: 'rgba(34, 197, 94, 0.10)',
          text: colors.green400,
          dot: colors.green500,
        }
      case 'at_risk':
        return {
          label: t('goals.metrics.atRisk'),
          bg: 'rgba(245, 158, 11, 0.10)',
          text: colors.amber400,
          dot: colors.amber500,
        }
      case 'behind':
        return {
          label: t('goals.metrics.behind'),
          bg: 'rgba(248, 113, 113, 0.10)',
          text: colors.red400,
          dot: colors.red500,
        }
      case 'no_deadline':
        return {
          label: t('goals.metrics.noDeadline'),
          bg: colors.surfaceElevated,
          text: colors.textSecondary,
          dot: colors.textMuted,
        }
      default:
        return null
    }
  }, [metrics?.trackingStatus, t])

  function formatMetricDate(dateStr: string) {
    return format(
      parseISO(dateStr),
      locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy',
      { locale: dateFnsLocale },
    )
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

        {/* Velocity */}
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
      </View>

      {/* Linked Habit Adherence */}
      {metrics.habitAdherence.length > 0 && (
        <View>
          <Text style={styles.adherenceTitle}>
            {t('goals.metrics.habitAdherence')}
          </Text>
          <View style={styles.adherenceList}>
            {metrics.habitAdherence.map((habit) => {
              const barColor =
                habit.weeklyCompletionRate >= 80
                  ? colors.green500
                  : habit.weeklyCompletionRate >= 50
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

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingVertical: 16,
  },

  // Skeleton
  skeletonBadge: {
    height: 32,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
  },
  skeletonStat: {
    height: 64,
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
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
    borderRadius: radius.sm,
    backgroundColor: colors.primary_10,
  },
  streakText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
})

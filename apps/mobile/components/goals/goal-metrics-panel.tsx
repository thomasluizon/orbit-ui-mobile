import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

const goalRadius = {
  sm: 8,
  lg: 16,
  xl: 20,
} as const

export function GoalMetricsPanel({
  metrics,
  unit,
  isLoading,
  isStreak = false,
}: GoalMetricsPanelProps) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const locale = i18n.language
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const statusConfig = useMemo(() => {
    const presentation = getGoalMetricsStatusPresentation(metrics?.trackingStatus)
    if (!presentation) return null

    switch (presentation.tone) {
      case 'success':
        return {
          label: t(presentation.labelKey),
          bg: `${tokens.statusDone}1A`,
          text: tokens.statusDone,
          dot: tokens.statusDone,
        }
      case 'warning':
        return {
          label: t(presentation.labelKey),
          bg: `${tokens.statusOverdue}1A`,
          text: tokens.statusOverdue,
          dot: tokens.statusOverdue,
        }
      case 'danger':
        return {
          label: t(presentation.labelKey),
          bg: `${tokens.statusBad}1A`,
          text: tokens.statusBad,
          dot: tokens.statusBad,
        }
      case 'muted':
        return {
          label: t(presentation.labelKey),
          bg: tokens.bgElev,
          text: tokens.fg2,
          dot: tokens.fg3,
        }
      default:
        return null
    }
  }, [tokens, metrics?.trackingStatus, t])

  function formatMetricDate(dateStr: string) {
    return formatGoalMetricsDate(dateStr, locale)
  }

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

  const daysRemaining =
    isStreak &&
    metrics.daysToDeadline != null &&
    metrics.daysToDeadline > 0
      ? metrics.daysToDeadline
      : null

  return (
    <View style={styles.container}>
      {statusConfig && (
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusConfig.dot }]} />
          <Text style={[styles.statusText, { color: statusConfig.text }]}>
            {statusConfig.label}
          </Text>
        </View>
      )}

      <View style={styles.statsGrid}>
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
                  ? tokens.statusDone
                  : adherenceTone === 'primary'
                    ? tokens.primary
                    : tokens.statusOverdue

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

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
  container: {
    gap: 16,
    paddingVertical: 16,
  },

  skeletonBadge: {
    height: 32,
    backgroundColor: tokens.bgElev,
    borderRadius: goalRadius.xl,
  },
  skeletonStat: {
    height: 64,
    flex: 1,
    backgroundColor: tokens.bgElev,
    borderRadius: goalRadius.xl,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: goalRadius.lg,
    borderWidth: 1,
    borderColor: tokens.hairline,
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

  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: tokens.bgElev,
    borderRadius: goalRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: tokens.hairline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.fg3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.fg1,
    marginTop: 4,
  },
  statValueAmber: {
    color: tokens.statusOverdue,
  },

  adherenceTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.fg3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  adherenceList: {
    gap: 8,
  },
  adherenceCard: {
    backgroundColor: tokens.bgElev,
    borderRadius: goalRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: tokens.hairline,
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
    color: tokens.fg1,
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
    backgroundColor: tokens.bgElev,
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
    color: tokens.fg3,
  },
  streakBadge: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: goalRadius.sm,
    backgroundColor: tokens.bgSunk,
  },
  streakText: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.primary,
  },
  })
}

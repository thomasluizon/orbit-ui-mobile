import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { SkeletonLine } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

/** Metrics: status row + flush SettingsRow strip + adherence rows.
 *  No chrome cards; purely hairline-separated rows (mirrors web). */
export function GoalMetricsPanel({
  metrics,
  unit,
  isLoading,
  isStreak = false,
}: Readonly<GoalMetricsPanelProps>) {
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

    let dotColor = tokens.fg3
    if (presentation.tone === 'success') dotColor = tokens.primary
    else if (presentation.tone === 'warning') dotColor = tokens.statusOverdue
    else if (presentation.tone === 'danger') dotColor = tokens.statusBad

    return {
      label: t(presentation.labelKey),
      dot: dotColor,
    }
  }, [tokens, metrics?.trackingStatus, t])

  if (isLoading) {
    return (
      <View>
        <SectionLabel top={8} bottom={0}>
          {t('goals.metrics.title')}
        </SectionLabel>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <SkeletonLine width={120} height={14} />
          </View>
        ))}
      </View>
    )
  }

  if (!metrics) return null

  return (
    <View>
      <SectionLabel top={8} bottom={0}>
        {t('goals.metrics.title')}
      </SectionLabel>

      {statusConfig ? (
        <SettingsRow
          label={t('goals.metrics.title')}
          accessory="none"
          leadingDot={statusConfig.dot}
          value={statusConfig.label}
          valueColor={tokens.fg1}
        />
      ) : null}

      <SettingsRow
        label={t('goals.metrics.projectedCompletion')}
        mono
        accessory="none"
        value={
          metrics.projectedCompletionDate
            ? formatGoalMetricsDate(metrics.projectedCompletionDate, locale)
            : t('goals.metrics.noData')
        }
        valueColor={tokens.fg1}
      />

      {isStreak ? (
        <SettingsRow
          label={t('goals.streak.daysRemaining', { count: metrics.daysToDeadline ?? 0 })}
          mono
          accessory="none"
          value={
            metrics.daysToDeadline != null
              ? String(metrics.daysToDeadline)
              : t('goals.metrics.noData')
          }
          valueColor={tokens.fg1}
        />
      ) : (
        <SettingsRow
          label={t('goals.metrics.velocity')}
          mono
          accessory="none"
          value={
            metrics.velocityPerDay > 0
              ? `${metrics.velocityPerDay} ${unit}/${t('goals.metrics.perDay')}`
              : t('goals.metrics.noData')
          }
          valueColor={tokens.fg1}
        />
      )}

      {metrics.habitAdherence.length > 0 ? (
        <>
          <SectionLabel top={8} bottom={0}>
            {t('goals.metrics.habitAdherence')}
          </SectionLabel>
          {metrics.habitAdherence.map((habit) => {
            const adherenceTone = getGoalHabitAdherenceTone(
              habit.weeklyCompletionRate,
            )
            const barColor =
              adherenceTone === 'success' || adherenceTone === 'primary'
                ? tokens.primary
                : tokens.statusOverdue

            return (
              <View key={habit.habitId} style={styles.adherenceRow}>
                <Text style={styles.adherenceTitle} numberOfLines={1}>
                  {habit.habitTitle}
                </Text>
                <View style={styles.adherenceTrack}>
                  <View
                    style={[
                      styles.adherenceFill,
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
            )
          })}
        </>
      ) : null}
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    skeletonRow: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    adherenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    adherenceTitle: {
      flex: 1,
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg1,
    },
    adherenceTrack: {
      width: 80,
      height: 3,
      borderRadius: 999,
      backgroundColor: tokens.bgSunk,
      overflow: 'hidden',
    },
    adherenceFill: {
      height: '100%',
      borderRadius: 999,
    },
    adherencePercent: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
      minWidth: 28,
      textAlign: 'right',
    },
  })
}

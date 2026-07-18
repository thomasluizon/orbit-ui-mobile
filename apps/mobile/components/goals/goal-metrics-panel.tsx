import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { SkeletonLine } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

/** Metrics: status row, a StatTile pair (projection + pace), and adherence rows (mirrors web). */
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
          <View
            key={i}
            style={[styles.skeletonRow, i === 3 ? styles.rowNoDivider : null]}
          >
            <SkeletonLine width={120} height={14} />
          </View>
        ))}
      </View>
    )
  }

  if (!metrics) return null

  const projectedValue = metrics.projectedCompletionDate
    ? formatGoalMetricsDate(metrics.projectedCompletionDate, locale)
    : t('goals.metrics.noData')

  const paceTile = isStreak
    ? {
        value: metrics.daysToDeadline ?? t('goals.metrics.noData'),
        label: t('goals.metrics.daysToDeadline'),
      }
    : {
        value:
          metrics.velocityPerDay > 0
            ? `${metrics.velocityPerDay} ${unit}/${t('goals.metrics.perDay')}`
            : t('goals.metrics.noData'),
        label: t('goals.metrics.velocity'),
      }

  return (
    <View>
      <SectionLabel top={8} bottom={0}>
        {t('goals.metrics.title')}
      </SectionLabel>

      {statusConfig ? (
        <SettingsRow
          label={t('goals.detail.statusLabel')}
          accessory="none"
          leadingDot={statusConfig.dot}
          value={statusConfig.label}
          valueColor={tokens.fg1}
        />
      ) : null}

      <View style={styles.tileRow}>
        <StatTile
          emoji="📅"
          value={projectedValue}
          label={t('goals.metrics.projectedCompletion')}
          phraseValue
        />
        <StatTile
          emoji="⚡"
          value={paceTile.value}
          label={paceTile.label}
          phraseValue={typeof paceTile.value === 'string'}
        />
      </View>

      {metrics.habitAdherence.length > 0 ? (
        <>
          <SectionLabel top={8} bottom={0}>
            {t('goals.metrics.habitAdherence')}
          </SectionLabel>
          {metrics.habitAdherence.map((habit, index) => {
            const adherenceTone = getGoalHabitAdherenceTone(
              habit.weeklyCompletionRate,
            )
            const barColor =
              adherenceTone === 'success' || adherenceTone === 'primary'
                ? tokens.primary
                : tokens.statusOverdue
            const isLast = index === metrics.habitAdherence.length - 1

            return (
              <View
                key={habit.habitId}
                style={[styles.adherenceRow, isLast ? styles.rowNoDivider : null]}
              >
                <Text style={styles.adherenceTitle} numberOfLines={1}>
                  {habit.habitTitle}
                </Text>
                <ProgressBar
                  style={styles.adherenceBar}
                  progress={Math.min(100, habit.weeklyCompletionRate) / 100}
                  label={habit.habitTitle}
                  color={barColor}
                />
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
    rowNoDivider: {
      borderBottomWidth: 0,
    },
    tileRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 4,
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
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg1,
    },
    adherenceBar: {
      width: 80,
      flexShrink: 0,
    },
    adherencePercent: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 12,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
      minWidth: 32,
      textAlign: 'right',
    },
  })
}

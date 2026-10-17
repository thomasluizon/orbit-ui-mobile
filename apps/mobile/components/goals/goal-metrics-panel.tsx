import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { GoalMetrics } from '@orbit/shared/types/goal'
import { formatGoalHistoryNumber, formatGoalMetricsDate } from '@orbit/shared/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

interface GoalMetricsPanelProps {
  metrics: GoalMetrics | null
  unit: string
  isLoading: boolean
}

export function GoalMetricsPanel({ metrics, unit, isLoading }: Readonly<GoalMetricsPanelProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const locale = i18n.language
  if (isLoading) return <GoalMetricsSkeleton label={t('goals.metrics.title')} />
  if (!metrics) return null

  const figures = [
    { key: 'daysToDeadline', label: t('goals.metrics.daysToDeadline'), value: metrics.daysToDeadline === null ? t('goals.metrics.noDeadline') : formatGoalHistoryNumber(metrics.daysToDeadline, locale) },
    { key: 'velocity', label: t('goals.metrics.velocity'), value: metrics.velocityPerDay > 0 ? t('goals.metrics.dailyPace', { value: formatGoalHistoryNumber(metrics.velocityPerDay, locale), unit }) : t('goals.metrics.noData') },
    { key: 'projectedCompletion', label: t('goals.metrics.projectedCompletion'), value: metrics.projectedCompletionDate ? formatGoalMetricsDate(metrics.projectedCompletionDate, locale) : t('goals.metrics.noData') },
  ]

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg1 }]}>{t('goals.metrics.title')}</Text>
      <View style={styles.section}>
        {figures.map(({ key, label, value }) => (
          <View key={key} accessible style={styles.figure}>
            <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
            <Text selectable style={[styles.value, { color: tokens.fg1 }]}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}


function GoalMetricsSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={styles.section}>
      <View style={styles.skeletonValue}><Skeleton variant="fill" grouped /></View>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.figure}>
          <View style={styles.skeletonLabel}><Skeleton variant="fill" grouped /></View>
          <View style={styles.skeletonValue}><Skeleton variant="fill" grouped /></View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeletonLabel: { height: 20, width: 144, maxWidth: '100%' },
  skeletonValue: { height: 24, width: 96 },
  section: { gap: 12, minWidth: 0 },
  figure: { gap: 4, minWidth: 0 },
  heading: { fontFamily: 'Geist_500Medium', fontSize: 20, lineHeight: 24 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 16, lineHeight: 22.4, fontVariant: ['tabular-nums'] },
})

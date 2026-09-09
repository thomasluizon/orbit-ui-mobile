import { StyleSheet, Text, View } from 'react-native'
import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { useTranslation } from 'react-i18next'
import type { Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import {
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from '../goal-detail-sections'

interface GoalDetailCollectionsProps {
  linkedHabits: NonNullable<Goal['linkedHabits']>
  entries: GoalDetailWithMetrics['goal']['progressHistory']
  unit: Goal['unit']
  formatDate: (dateStr: string) => string
}

export function GoalDetailCollections({
  linkedHabits,
  entries,
  unit,
  formatDate,
}: Readonly<GoalDetailCollectionsProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const linkedHabitsSection = (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg1 }]}>{t('goals.linkedHabits')}</Text>
      <GoalLinkedHabitsSection
        title={t('goals.linkedHabits')}
        emptyLabel={t('goals.noLinkedHabits')}
        linkedHabits={linkedHabits}
      />
    </View>
  )

  const progressHistorySection =
    entries.length > 0 ? (
      <View>
        <Text accessibilityRole="header" style={[styles.historyTitle, { color: tokens.fg2 }]}>{t('goals.progressHistory')}</Text>
        <GoalProgressHistorySection
          entries={entries}
          formatDate={formatDate}
          renderEntryLabel={(entry) =>
            t('goals.progressEntry', {
              previous: entry.previousValue,
              value: entry.value,
              unit,
            })
          }
          showAllLabel={t('goals.detail.showAllHistory', { count: entries.length })}
          showLessLabel={t('goals.detail.showLessHistory')}
        />
      </View>
    ) : null

  return (
    <>
      <View style={styles.section}>
        {linkedHabits.length >= MAX_HABITS_PER_GOAL ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
        {linkedHabitsSection}
      </View>
      {progressHistorySection}
    </>
  )
}

const styles = StyleSheet.create({ section: { gap: 12 }, heading: { fontFamily: 'Geist_500Medium', fontSize: 20 }, historyTitle: { fontFamily: 'Geist_500Medium', fontSize: 14 } })

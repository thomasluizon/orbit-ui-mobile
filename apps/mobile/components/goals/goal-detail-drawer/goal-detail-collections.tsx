import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import { SectionLabel } from '@/components/ui/section-label'
import {
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from '../goal-detail-sections'

interface GoalDetailCollectionsProps {
  isStreak: boolean
  linkedHabits: NonNullable<Goal['linkedHabits']>
  entries: GoalDetailWithMetrics['goal']['progressHistory']
  unit: Goal['unit']
  formatDate: (dateStr: string) => string
}

/** Progress-history and linked-habits cluster; streak goals lead with linked
 *  habits, standard goals lead with progress history. */
export function GoalDetailCollections({
  isStreak,
  linkedHabits,
  entries,
  unit,
  formatDate,
}: Readonly<GoalDetailCollectionsProps>) {
  const { t } = useTranslation()

  const linkedHabitsSection =
    linkedHabits.length > 0 ? (
      <View>
        <SectionLabel top={8} bottom={0}>
          {t('goals.linkedHabits')}
        </SectionLabel>
        <GoalLinkedHabitsSection
          title={t('goals.linkedHabits')}
          linkedHabits={linkedHabits}
        />
      </View>
    ) : null

  const progressHistorySection =
    entries.length > 0 ? (
      <View>
        <SectionLabel top={8} bottom={0}>
          {t('goals.progressHistory')}
        </SectionLabel>
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
          showAllLabel={t('goals.detail.showAllHistory')}
          showLessLabel={t('goals.detail.showLessHistory')}
        />
      </View>
    ) : null

  return isStreak ? (
    <>
      {linkedHabitsSection}
      {progressHistorySection}
    </>
  ) : (
    <>
      {progressHistorySection}
      {linkedHabitsSection}
    </>
  )
}

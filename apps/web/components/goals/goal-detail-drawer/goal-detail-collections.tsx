'use client'

import { useTranslations } from 'next-intl'
import type { Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
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
  const t = useTranslations()

  return (
    <>
      {isStreak && linkedHabits.length > 0 && (
        <GoalLinkedHabitsSection
          title={t('goals.linkedHabits')}
          linkedHabits={linkedHabits}
        />
      )}

      <GoalProgressHistorySection
        title={t('goals.progressHistory')}
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

      {!isStreak && (
        <GoalLinkedHabitsSection
          title={t('goals.linkedHabits')}
          linkedHabits={linkedHabits}
        />
      )}
    </>
  )
}

'use client'

import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { useTranslations } from 'next-intl'
import type { Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
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
  const t = useTranslations()

  return (
    <>
      <div className="flex flex-col gap-3">
        {linkedHabits.length >= MAX_HABITS_PER_GOAL ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
        <GoalLinkedHabitsSection title={t('goals.linkedHabits')} emptyLabel={t('goals.noLinkedHabits')} linkedHabits={linkedHabits} />
      </div>
      <GoalProgressHistorySection title={t('goals.progressHistory')} entries={entries} formatDate={formatDate}
        renderEntryLabel={(entry) => t('goals.progressEntry', { previous: entry.previousValue, value: entry.value, unit })}
        showAllLabel={t('goals.detail.showAllHistory', { count: entries.length })} showLessLabel={t('goals.detail.showLessHistory')} />
    </>
  )
}

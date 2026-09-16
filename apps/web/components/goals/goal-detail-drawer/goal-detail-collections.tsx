'use client'

import { MAX_HABITS_PER_GOAL } from '@orbit/shared/validation'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { useTranslations } from 'next-intl'
import type { MouseEvent } from 'react'
import type { Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import {
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from '../goal-detail-sections'

interface GoalDetailCollectionsProps {
  linkedHabits: NonNullable<Goal['linkedHabits']>
  habitAdherence: GoalDetailWithMetrics['metrics']['habitAdherence']
  entries: GoalDetailWithMetrics['goal']['progressHistory']
  unit: Goal['unit']
  formatDate: (dateStr: string) => string
  onLinkedHabitNavigate?: (habitId: string, event: MouseEvent<HTMLElement>) => void
}

export function GoalDetailCollections({
  linkedHabits,
  habitAdherence,
  entries,
  unit,
  formatDate,
  onLinkedHabitNavigate,
}: Readonly<GoalDetailCollectionsProps>) {
  const t = useTranslations()

  return (
    <>
      <GoalLinkedHabitsSection
        title={t('goals.linkedHabits')}
        emptyLabel={t('goals.noLinkedHabits')}
        linkedHabits={linkedHabits}
        habitAdherence={habitAdherence}
        formatValue={(currentStreak) => t('goals.detail.linkedHabitStreak', { count: currentStreak })}
        onLinkedHabitNavigate={onLinkedHabitNavigate}
        notice={linkedHabits.length >= MAX_HABITS_PER_GOAL ? <CapacityNotice message={t('goals.detail.linkedLimit', { count: MAX_HABITS_PER_GOAL })} /> : null}
      />
      <GoalProgressHistorySection title={t('goals.progressHistory')} entries={entries} formatDate={formatDate}
        renderEntryLabel={(entry) => t('goals.progressEntry', { previous: entry.previousValue, value: entry.value, unit })}
        showAllLabel={t('goals.detail.showAllHistory', { count: entries.length })} showLessLabel={t('goals.detail.showLessHistory')} />
    </>
  )
}

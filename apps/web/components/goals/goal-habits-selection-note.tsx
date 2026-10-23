'use client'

import { useTranslations } from 'next-intl'
import { useHabits } from '@/hooks/use-habit-queries'
import { getGoalHabitProgressNote } from '@orbit/shared/hooks'
import type { GoalType } from '@orbit/shared/types/goal'

export function GoalHabitsSelectionNote({ selectedIds, goalType }: Readonly<{ selectedIds: string[]; goalType: GoalType }>) {
  const t = useTranslations()
  const habits = useHabits({})
  const note = getGoalHabitProgressNote(selectedIds, habits.data?.habitsById, goalType)
  return note ? <p className="max-w-prose text-sm leading-[1.55] text-pretty text-[var(--fg-2)]">{t(note)}</p> : null
}

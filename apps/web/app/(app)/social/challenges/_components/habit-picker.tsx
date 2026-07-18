'use client'

import { useTranslations } from 'next-intl'
import { isCompletedOneTimeHabit } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { useHabits } from '@/hooks/use-habits'

interface HabitPickerProps {
  selectedIds: string[]
  onToggle: (habitId: string) => void
}

/** Multi-select chip list of the user's top-level habits used to link contributions to a challenge. */
export function HabitPicker({ selectedIds, onToggle }: Readonly<HabitPickerProps>) {
  const t = useTranslations()
  const { data } = useHabits({})
  const habits = (data?.topLevelHabits ?? []).filter(
    (habit) => !isCompletedOneTimeHabit(habit),
  )
  const selectedIdSet = new Set(selectedIds)

  if (habits.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
        {t('challenges.create.noHabits')}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      {habits.map((habit) => (
        <Chip
          key={habit.id}
          active={selectedIdSet.has(habit.id)}
          ariaLabel={habit.title}
          onClick={() => onToggle(habit.id)}
        >
          {habit.title}
        </Chip>
      ))}
    </div>
  )
}

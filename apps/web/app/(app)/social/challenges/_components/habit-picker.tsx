'use client'

import { useTranslations } from 'next-intl'
import { useHabits } from '@/hooks/use-habits'

interface HabitPickerProps {
  selectedIds: string[]
  onToggle: (habitId: string) => void
}

/** Multi-select chip list of the user's top-level habits used to link contributions to a challenge. */
export function HabitPicker({ selectedIds, onToggle }: Readonly<HabitPickerProps>) {
  const t = useTranslations()
  const { data } = useHabits({})
  const habits = data?.topLevelHabits ?? []

  if (habits.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
        {t('challenges.create.noHabits')}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      {habits.map((habit) => {
        const active = selectedIds.includes(habit.id)
        return (
          <button
            key={habit.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(habit.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 0,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: active ? 'var(--primary)' : 'var(--fg-2)',
              background: active ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-elev)',
              boxShadow: active
                ? 'inset 0 0 0 1px var(--primary)'
                : 'inset 0 0 0 1px var(--hairline)',
            }}
          >
            {habit.title}
          </button>
        )
      })}
    </div>
  )
}

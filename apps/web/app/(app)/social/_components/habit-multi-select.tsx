'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { useHabits } from '@/hooks/use-habits'

const MAX_HABITS = 10

interface HabitMultiSelectProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

/** Toggleable list of the user's top-level habits, capped at 1–10 for accountability pairing. */
export function HabitMultiSelect({ selectedIds, onChange }: Readonly<HabitMultiSelectProps>) {
  const t = useTranslations()
  const { data } = useHabits({})
  const habits = data?.topLevelHabits ?? []

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((habitId) => habitId !== id))
      return
    }
    if (selectedIds.length >= MAX_HABITS) return
    onChange([...selectedIds, id])
  }

  if (habits.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
        {t('social.buddies.noHabits')}
      </p>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {t('social.buddies.habitsHint')}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {t('social.buddies.habitCount', { count: selectedIds.length })}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: 6, maxHeight: 260, overflowY: 'auto' }}>
        {habits.map((habit) => {
          const active = selectedIds.includes(habit.id)
          const disabled = !active && selectedIds.length >= MAX_HABITS
          return (
            <button
              key={habit.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(habit.id)}
              className="flex items-center justify-between cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                gap: 10,
                padding: '12px 14px',
                borderRadius: 14,
                border: 0,
                textAlign: 'left',
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                color: active ? 'var(--primary)' : 'var(--fg-1)',
                background: active ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-elev)',
                boxShadow: active
                  ? 'inset 0 0 0 1px var(--primary)'
                  : 'inset 0 0 0 1px var(--hairline)',
              }}
            >
              <span className="truncate">{habit.title}</span>
              {active ? <Check size={18} strokeWidth={2} /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

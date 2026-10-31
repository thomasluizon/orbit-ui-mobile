'use client'

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildSearchHabitStatus, habitInitial, type CommandHabitEntry } from '@orbit/shared/utils'
import { HabitMatchLine } from '@/components/search/habit-match-line'
import { SearchHabitStatusLine } from '@/components/search/search-habit-status'
import { CommandRow } from './command-row'

export function commandHabitValue({ habit, parentTitle }: CommandHabitEntry): string {
  return parentTitle ? `${parentTitle} ${habit.title} ${habit.id}` : `${habit.title} ${habit.id}`
}

function habitLeading(habit: NormalizedHabit): ReactNode {
  if (habit.emoji) {
    return (
      <span className="text-[18px] leading-none" aria-hidden>
        {habit.emoji}
      </span>
    )
  }
  return <span className="text-[14px] font-medium leading-none text-[var(--fg-3)]" aria-hidden>{habitInitial(habit.title)}</span>
}

interface CommandHabitItemsProps {
  disclose: boolean
  disabled?: boolean
  query?: string
  entries: readonly CommandHabitEntry[]
  today: string
  onSelectHabit: (habit: NormalizedHabit) => void
}

/** Renders the habit rows shared by the search/jump, log, and skip palette pages.
 *  Sub-habits show a "Parent · Child" label so they read distinctly in the flat list. */
export function CommandHabitItems({ entries, today, onSelectHabit, disclose, query = '', disabled = false }: Readonly<CommandHabitItemsProps>) {
  const t = useTranslations()
  const locale = useLocale()
  return (
    <>
      {entries.map((entry) => {
        const { habit, parentTitle } = entry
        const status = buildSearchHabitStatus(habit, t, locale, today)
        const label = parentTitle ? `${parentTitle} · ${habit.title}` : habit.title
        return (
          <CommandRow
            key={habit.id}
            textMode="personal"
            disclose={disclose}
            disabled={disabled}
            leading={habitLeading(habit)}
            description={<><SearchHabitStatusLine status={status} /><HabitMatchLine habit={habit} query={query} /></>}
            accessibleLabel={status ? `${label} ${status.label}` : undefined}
            label={label}
            value={commandHabitValue(entry)}
            onSelect={() => onSelectHabit(habit)}
          />
        )
      })}
    </>
  )
}

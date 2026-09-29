'use client'

import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { habitInitial, type CommandHabitEntry } from '@orbit/shared/utils'
import { HabitMatchLine } from '@/components/search/habit-match-line'
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
  disabled?: boolean
  query?: string
  entries: readonly CommandHabitEntry[]
  onSelectHabit: (habit: NormalizedHabit) => void
}

/** Renders the habit rows shared by the search/jump, log, and skip palette pages.
 *  Sub-habits show a "Parent · Child" label so they read distinctly in the flat list. */
export function CommandHabitItems({ entries, onSelectHabit, query = '', disabled = false }: Readonly<CommandHabitItemsProps>) {
  return (
    <>
      {entries.map((entry) => {
        const { habit, parentTitle } = entry
        return (
          <CommandRow
            key={habit.id}
            disabled={disabled}
            leading={habitLeading(habit)}
            description={<HabitMatchLine habit={habit} query={query} />}
            label={parentTitle ? `${parentTitle} · ${habit.title}` : habit.title}
            value={commandHabitValue(entry)}
            onSelect={() => onSelectHabit(habit)}
          />
        )
      })}
    </>
  )
}

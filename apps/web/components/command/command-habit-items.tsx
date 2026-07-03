'use client'

import type { ReactNode } from 'react'
import { Circle } from 'lucide-react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { CommandRow } from './command-row'
import type { CommandHabitEntry } from './build-command-habit-list'

function habitLeading(emoji: string | null | undefined): ReactNode {
  if (emoji) {
    return (
      <span className="text-[16px] leading-none" aria-hidden>
        {emoji}
      </span>
    )
  }
  return <Circle className="size-[22px]" strokeWidth={1.8} aria-hidden />
}

interface CommandHabitItemsProps {
  entries: readonly CommandHabitEntry[]
  onSelectHabit: (habit: NormalizedHabit) => void
}

/** Renders the habit rows shared by the search/jump, log, and skip palette pages.
 *  Sub-habits show a "Parent · Child" label so they read distinctly in the flat list. */
export function CommandHabitItems({ entries, onSelectHabit }: Readonly<CommandHabitItemsProps>) {
  return (
    <>
      {entries.map(({ habit, parentTitle }) => (
        <CommandRow
          key={habit.id}
          leading={habitLeading(habit.emoji)}
          label={parentTitle ? `${parentTitle} · ${habit.title}` : habit.title}
          value={
            parentTitle
              ? `${parentTitle} ${habit.title} ${habit.id}`
              : `${habit.title} ${habit.id}`
          }
          onSelect={() => onSelectHabit(habit)}
        />
      ))}
    </>
  )
}

'use client'

import type { ReactNode } from 'react'
import { Circle } from 'lucide-react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { CommandRow } from './command-row'

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
  habits: readonly NormalizedHabit[]
  onSelectHabit: (habit: NormalizedHabit) => void
}

/** Renders the habit rows shared by the search/jump, log, and skip palette pages. */
export function CommandHabitItems({ habits, onSelectHabit }: Readonly<CommandHabitItemsProps>) {
  return (
    <>
      {habits.map((habit) => (
        <CommandRow
          key={habit.id}
          leading={habitLeading(habit.emoji)}
          label={habit.title}
          value={`${habit.title} ${habit.id}`}
          onSelect={() => onSelectHabit(habit)}
        />
      ))}
    </>
  )
}

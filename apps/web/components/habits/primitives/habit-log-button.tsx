'use client'

import { Check } from 'lucide-react'
import type { CSSProperties, MouseEvent } from 'react'

interface HabitLogButtonProps {
  color: string
  done: boolean
  disabled?: boolean
  size?: number
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  ariaLabel: string
  overdue?: boolean
}

/**
 * Circular log/uncheck button. When done, fills with the accent color and
 * shows a checkmark. Matches the new card's accent-driven styling.
 */
export function HabitLogButton({
  color,
  done,
  disabled,
  size = 36,
  onClick,
  ariaLabel,
  overdue,
}: Readonly<HabitLogButtonProps>) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: done ? color : 'transparent',
    borderColor: done ? color : overdue ? 'rgb(248 113 113 / 0.5)' : color,
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={done}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event)
      }}
      className={`relative flex items-center justify-center rounded-full border-2 transition-all duration-200 ${
        done ? 'shadow-sm' : 'hover:scale-105 hover:shadow-sm'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={style}
    >
      {done && <Check className="size-4 text-white" strokeWidth={3} />}
    </button>
  )
}

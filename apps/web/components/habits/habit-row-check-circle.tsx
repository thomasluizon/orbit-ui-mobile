'use client'

import { useId } from 'react'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HabitCheck } from './habit-check'

interface CheckCircleProps {
  state: HabitStatus
  unavailable?: boolean
  onToggle: () => void
  disabled: boolean
  ariaLabel: string
  disabledReason?: string
}

export function CheckCircle({ state, unavailable = false, onToggle, disabled, ariaLabel, disabledReason }: Readonly<CheckCircleProps>) {
  const reasonId = useId()

  return (
    <button
      type="button"
      data-testid="habit-status-toggle"
      data-habit-row-control="check"
      onClick={(event) => {
        event.stopPropagation()
        if (disabled) return
        onToggle()
      }}
      disabled={disabled && !disabledReason}
      aria-disabled={disabled && disabledReason ? true : undefined}
      aria-label={ariaLabel}
      aria-describedby={disabled && disabledReason ? reasonId : undefined}
      title={disabled ? disabledReason : undefined}
      className={`appearance-none border-0 bg-transparent shrink-0 flex min-h-[48px] w-[48px] items-center justify-center rounded-[20px] transition-transform duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${disabled ? 'cursor-default' : 'cursor-pointer motion-safe:active:scale-[0.96]'}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <span aria-hidden="true" className="flex">
        {unavailable
          ? <HabitCheck status={state} unavailable />
          : <HabitCheck status={state} label={ariaLabel} />}
      </span>
      {disabled && disabledReason ? <span id={reasonId} className="sr-only">{disabledReason}</span> : null}
    </button>
  )
}

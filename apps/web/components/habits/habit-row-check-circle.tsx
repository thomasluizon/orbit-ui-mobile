'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
  const previousState = useRef(state)
  const [justCompleted, setJustCompleted] = useState(false)
  const reasonId = useId()

  useEffect(() => {
    const completedNow = state === 'done' && previousState.current !== 'done'
    previousState.current = state
    if (!completedNow) return
    setJustCompleted(true)
    const timer = window.setTimeout(() => setJustCompleted(false), 160)
    return () => window.clearTimeout(timer)
  }, [state])

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
      className={`appearance-none border-0 bg-transparent shrink-0 flex min-h-[48px] w-[48px] items-center justify-center rounded-[22px] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.96]'}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <span aria-hidden="true" className={justCompleted ? 'animate-check-pop' : undefined}>
        {unavailable
          ? <HabitCheck status={state} unavailable />
          : <HabitCheck status={state} label={ariaLabel} />}
      </span>
      {disabled && disabledReason ? <span id={reasonId} className="sr-only">{disabledReason}</span> : null}
    </button>
  )
}

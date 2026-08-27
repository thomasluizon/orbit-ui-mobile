'use client'

import { useEffect, useRef, useState } from 'react'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { StatusRing } from '@/components/ui/status-ring'

interface CheckCircleProps {
  state: HabitStatus
  onToggle: () => void
  disabled: boolean
  ariaLabel: string
  size?: number
}

export function CheckCircle({ state, onToggle, disabled, ariaLabel, size = 30 }: Readonly<CheckCircleProps>) {
  const previousState = useRef(state)
  const [justCompleted, setJustCompleted] = useState(false)

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
      onClick={(event) => {
        event.stopPropagation()
        if (disabled) return
        onToggle()
      }}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      className={`appearance-none border-0 bg-transparent shrink-0 flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-[160ms] ease-[var(--ease-standard)] ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--bg-hover)] active:scale-[0.96]'}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <span aria-hidden="true" className={justCompleted ? 'animate-check-pop' : undefined}>
        <StatusRing status={state} size={size} label={ariaLabel} />
      </span>
    </button>
  )
}

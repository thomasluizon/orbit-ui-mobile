'use client'

import { useState } from 'react'
import { Check } from '@/components/ui/icons'
import type { StatusDotState } from '@/components/ui/status-dot'

const CHECK_FILLED_STATES: ReadonlySet<StatusDotState> = new Set(['done', 'skip', 'frozen'])

const CHECK_COLOR_VAR: Record<StatusDotState, string> = {
  done: 'var(--status-done)',
  empty: 'var(--status-empty)',
  skip: 'var(--status-skip)',
  overdue: 'var(--status-overdue)',
  bad: 'var(--status-bad)',
  frozen: 'var(--status-frozen)',
}

interface CheckCircleProps {
  state: StatusDotState
  /** 'bad' fills the logged circle in status-bad instead of status-done. */
  tone?: 'default' | 'bad'
  onToggle: () => void
  disabled: boolean
  ariaLabel: string
}

export function CheckCircle({ state, tone = 'default', onToggle, disabled, ariaLabel }: Readonly<CheckCircleProps>) {
  const filled = CHECK_FILLED_STATES.has(state)
  const color =
    tone === 'bad' && state === 'done' ? 'var(--status-bad)' : CHECK_COLOR_VAR[state]
  const [previousFilled, setPreviousFilled] = useState(filled)
  const [justCompleted, setJustCompleted] = useState(false)
  if (filled !== previousFilled) {
    setPreviousFilled(filled)
    setJustCompleted(filled)
  }

  let boxShadow: string
  if (!filled) {
    boxShadow = `inset 0 0 0 2px ${color}`
  } else if (state === 'done') {
    boxShadow =
      tone === 'bad'
        ? '0 4px 14px color-mix(in srgb, var(--status-bad) 35%, transparent)'
        : '0 4px 14px rgba(var(--primary-rgb), 0.35)'
  } else {
    boxShadow = 'none'
  }

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
      className={`appearance-none border-0 bg-transparent shrink-0 flex items-center justify-center ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{ padding: 7, margin: -7, opacity: disabled ? 0.4 : 1 }}
    >
      <span
        className={`flex items-center justify-center rounded-full transition-transform duration-[160ms] ease-[var(--ease-standard)] ${disabled ? '' : 'hover:scale-105 active:scale-[0.96]'} ${justCompleted ? 'animate-check-pop' : ''}`}
        style={{
          width: 30,
          height: 30,
          background: filled ? color : 'transparent',
          boxShadow,
        }}
      >
        {filled && <Check size={17} strokeWidth={3} color="var(--fg-on-primary)" aria-hidden="true" />}
      </span>
    </button>
  )
}

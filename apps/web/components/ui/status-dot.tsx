'use client'

import type { MouseEvent } from 'react'

/** Single desaturated status dot. Hollow when state === 'empty'. */
export type StatusDotState =
  | 'done'
  | 'empty'
  | 'skip'
  | 'overdue'
  | 'bad'
  | 'frozen'

interface StatusDotProps {
  state?: StatusDotState
  size?: number
  onToggle?: () => void
  ariaLabel?: string
  disabled?: boolean
}

const FILLED_STATES: ReadonlySet<StatusDotState> = new Set(['done', 'skip', 'frozen'])

const COLOR_VAR: Record<StatusDotState, string> = {
  done: 'var(--status-done)',
  empty: 'var(--status-empty)',
  skip: 'var(--status-skip)',
  overdue: 'var(--status-overdue)',
  bad: 'var(--status-bad)',
  frozen: 'var(--status-frozen)',
}

export function StatusDot({
  state = 'empty',
  size = 8,
  onToggle,
  ariaLabel,
  disabled = false,
}: Readonly<StatusDotProps>) {
  const isFilled = FILLED_STATES.has(state)
  const color = COLOR_VAR[state]

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (disabled) return
    onToggle?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel ?? state}
      className={`group appearance-none border-0 bg-transparent shrink-0 flex items-center justify-center ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{ padding: 10, margin: -10, opacity: disabled ? 0.4 : 1 }}
    >
      <span
        className={`block rounded-full transition-transform duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] ${disabled ? '' : 'group-hover:scale-125 group-active:scale-90'}`}
        style={{
          width: size,
          height: size,
          background: isFilled ? color : 'transparent',
          boxShadow: isFilled ? 'none' : `inset 0 0 0 1.5px ${color}`,
        }}
      />
    </button>
  )
}

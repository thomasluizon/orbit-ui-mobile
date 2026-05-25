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
}

const COLOR_VAR: Record<StatusDotState, string> = {
  done: 'var(--status-done)',
  empty: 'transparent',
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
}: Readonly<StatusDotProps>) {
  const isHollow = state === 'empty'

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onToggle?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel ?? state}
      className="group appearance-none border-0 bg-transparent cursor-pointer shrink-0"
      style={{ padding: 10, margin: -10 }}
    >
      <span
        className="inline-block rounded-full transition-transform duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-125 group-active:scale-90"
        style={{
          width: size,
          height: size,
          background: COLOR_VAR[state],
          boxShadow: isHollow ? 'inset 0 0 0 1.5px var(--status-empty)' : 'none',
        }}
      />
    </button>
  )
}

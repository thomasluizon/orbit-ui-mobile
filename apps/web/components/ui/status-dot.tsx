'use client'

import type { CSSProperties, MouseEvent } from 'react'
import { orbitalMotion } from '@orbit/shared/theme'
import { resolveStatusDotFill } from '@/components/ui/status-dot-fill'

/** Single desaturated status dot. Hollow when state === 'empty'. */
export type StatusDotState =
  | 'done'
  | 'empty'
  | 'skip'
  | 'overdue'
  | 'bad'
  | 'frozen'

interface StatusDotProps {
  state: StatusDotState
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

/** Tappable status dot. Completion remains a neutral, static status cue. */
export function StatusDot({
  state,
  size = 8,
  onToggle,
  ariaLabel,
  disabled = false,
}: Readonly<StatusDotProps>) {
  const isFilled = FILLED_STATES.has(state)
  const color = COLOR_VAR[state]
  const fill = resolveStatusDotFill(isFilled, color)
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (disabled) return
    onToggle?.()
  }

  if (!onToggle) {
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? state}
        className="block rounded-full shrink-0"
        style={{
          width: size,
          height: size,
          ...fill,
          opacity: disabled ? 0.4 : 1,
        }}
      />
    )
  }

  const hitPadding = Math.max(0, (44 - size) / 2)

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel ?? state}
      className={`group appearance-none border-0 bg-transparent shrink-0 flex items-center justify-center transition-transform duration-[var(--status-dot-press-duration)] enabled:active:scale-[var(--status-dot-press-scale)] ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{
        padding: hitPadding,
        margin: -hitPadding,
        opacity: disabled ? 0.4 : 1,
        '--status-dot-press-duration': `${orbitalMotion.press.duration}ms`,
        '--status-dot-press-scale': orbitalMotion.press.scale,
      } as CSSProperties}
    >
      <span
        className={`block rounded-full transition-opacity duration-150 ${disabled ? '' : 'group-hover:opacity-80 group-active:opacity-70'}`}
        style={{
          width: size,
          height: size,
          ...fill,
        }}
      />
    </button>
  )
}

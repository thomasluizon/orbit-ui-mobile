'use client'

import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
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

const SWEEP_MS = 420

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Tappable status dot. On an interactive transition into `done`, a `--primary`
 *  arc sweeps once around the dot and the fill settles in (the Today completion
 *  signature). Read-only dots and already-done mounts render statically. */
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
  const interactive = !disabled && !!onToggle

  const [prevState, setPrevState] = useState(state)
  const [playing, setPlaying] = useState(false)
  if (state !== prevState) {
    setPrevState(state)
    setPlaying(
      prevState !== 'done' && state === 'done' && interactive && !prefersReducedMotion(),
    )
  }

  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => setPlaying(false), SWEEP_MS + 40)
    return () => clearTimeout(id)
  }, [playing])

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
      className={`group appearance-none border-0 bg-transparent shrink-0 flex items-center justify-center ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{ padding: hitPadding, margin: -hitPadding, opacity: disabled ? 0.4 : 1 }}
    >
      {playing ? (
        <CompletionSweep size={size} />
      ) : (
        <span
          className={`block rounded-full transition-transform duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] ${disabled ? '' : 'group-hover:scale-125 group-active:scale-[0.96]'}`}
          style={{
            width: size,
            height: size,
            ...fill,
          }}
        />
      )}
    </button>
  )
}

function CompletionSweep({ size }: Readonly<{ size: number }>) {
  const trackStroke = 1.5
  const trackR = (size - trackStroke) / 2
  const pieR = size / 4
  const pieStroke = size / 2
  const c = 2 * Math.PI * pieR

  const pieStyle = {
    strokeDashoffset: c,
    animation: `status-sweep ${SWEEP_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
    ['--sweep-c']: `${c}`,
  } as CSSProperties

  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={trackR}
          fill="none"
          stroke="var(--status-empty)"
          strokeWidth={trackStroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={pieR}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={pieStroke}
          strokeDasharray={c}
          style={pieStyle}
        />
      </svg>
    </span>
  )
}

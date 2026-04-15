'use client'

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import {
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
  getHabitProgressStrokeDasharray,
} from '@orbit/shared/utils'

type HabitLogButtonSize = 'sm' | 'md'

interface HabitLogButtonProps {
  size?: HabitLogButtonSize
  isCompleted: boolean
  isOverdue: boolean
  isBadHabit: boolean
  showArc: boolean
  progressRatio: number
  centerLabel?: string | null
  isDisabled?: boolean
  pulse?: boolean
  glow?: boolean
  onClick: () => void
  ariaLabel: string
}

interface SizeTokens {
  outer: number
  inner: number
  radiusClass: string
  checkPx: number
  labelPx: number
}

const SIZES: Record<HabitLogButtonSize, SizeTokens> = {
  sm: { outer: 44, inner: 40, radiusClass: 'rounded-[12px]', checkPx: 18, labelPx: 11 },
  md: { outer: 56, inner: 52, radiusClass: 'rounded-[14px]', checkPx: 22, labelPx: 13 },
}

function renderLogButtonContent({
  isCompleted,
  centerLabel,
  checkPx,
  labelPx,
}: Readonly<{
  isCompleted: boolean
  centerLabel: string | null | undefined
  checkPx: number
  labelPx: number
}>) {
  if (isCompleted) {
    return (
      <Check
        width={checkPx}
        height={checkPx}
        strokeWidth={2.5}
        aria-hidden="true"
      />
    )
  }
  if (centerLabel) {
    return (
      <span className="tabular-nums font-bold" style={{ fontSize: labelPx }}>
        {centerLabel}
      </span>
    )
  }
  return null
}

/**
 * Interactive log / finalize button that sits to the left of every habit card.
 *
 * - Simple habits: tap to log, shows primary-tinted surface → solid primary
 *   check when completed.
 * - Parents with children: shows "x/n" progress label and wraps itself in the
 *   progress arc.
 * - Flexible habits: progress arc only (no center label).
 *
 * The decorative emoji identity is rendered separately by {@link HabitAvatarTile}
 * immediately to the right of this button.
 */
export function HabitLogButton({
  size = 'md',
  isCompleted,
  isOverdue,
  isBadHabit,
  showArc,
  progressRatio,
  centerLabel,
  isDisabled = false,
  pulse = false,
  glow = false,
  onClick,
  ariaLabel,
}: Readonly<HabitLogButtonProps>) {
  const tokens = SIZES[size]

  const arcDasharray = useMemo(
    () => getHabitProgressStrokeDasharray(progressRatio * 100, isCompleted),
    [progressRatio, isCompleted],
  )

  let surfaceClass: string
  let contentClass: string
  if (isCompleted) {
    surfaceClass = 'bg-primary text-white'
    contentClass = 'text-white'
  } else if (isBadHabit) {
    surfaceClass = 'bg-[rgb(var(--color-destructive-rgb)/0.12)] text-destructive'
    contentClass = 'text-destructive'
  } else {
    surfaceClass = 'bg-primary/[0.14] text-primary'
    contentClass = 'text-primary'
  }

  let ringClass = 'ring-1 ring-primary/25'
  if (isCompleted) {
    ringClass = 'ring-1 ring-primary/40'
  } else if (isBadHabit) {
    ringClass = 'ring-1 ring-[rgb(var(--color-destructive-rgb)/0.25)]'
  }
  if (isOverdue && !isCompleted) {
    ringClass = 'ring-1 ring-[rgb(var(--color-destructive-rgb)/0.45)]'
  }

  const shouldRenderArcFill = showArc && (isCompleted || progressRatio > 0)
  const wrapperSize = shouldRenderArcFill ? tokens.outer : tokens.inner

  return (
    <button
      type="button"
      data-no-drag
      onClick={(e) => {
        e.stopPropagation()
        if (isDisabled) return
        onClick()
      }}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-pressed={isCompleted}
      className={`relative inline-flex items-center justify-center cursor-pointer appearance-none bg-transparent border-0 p-0 m-0 rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-default ${
        pulse ? 'animate-habit-tile-pop' : ''
      } ${glow ? 'animate-habit-tile-glow' : ''}`}
      style={{ width: wrapperSize, height: wrapperSize, background: 'none' }}
    >
      {shouldRenderArcFill ? (
        <svg
          className="pointer-events-none absolute inset-0 -rotate-90 habit-arc-glow"
          viewBox="0 0 36 36"
          width={tokens.outer}
          height={tokens.outer}
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={isCompleted || progressRatio === 1 ? 'text-primary' : 'text-primary/70'}
            strokeDasharray={arcDasharray}
            strokeDashoffset={(HABIT_PROGRESS_RING_CIRCUMFERENCE / 4).toFixed(2)}
          />
        </svg>
      ) : null}

      <span
        aria-hidden="true"
        className={`relative inline-flex items-center justify-center overflow-hidden ${tokens.radiusClass} ${surfaceClass} ${ringClass} habit-avatar-inner-highlight habit-avatar-hover-shadow font-semibold leading-none select-none transition-all duration-200 ${contentClass}`}
        style={{ width: tokens.inner, height: tokens.inner }}
      >
        {renderLogButtonContent({
          isCompleted,
          centerLabel,
          checkPx: tokens.checkPx,
          labelPx: tokens.labelPx,
        })}
      </span>
    </button>
  )
}

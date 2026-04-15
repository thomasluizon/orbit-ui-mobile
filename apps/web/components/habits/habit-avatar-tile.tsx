'use client'

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  getHabitInitial,
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
  getHabitProgressStrokeDasharray,
} from '@orbit/shared/utils'

type HabitAvatarTileSize = 'sm' | 'md'

interface HabitAvatarTileProps {
  icon: string | null | undefined
  title: string
  size?: HabitAvatarTileSize
  isCompleted: boolean
  isOverdue: boolean
  isBadHabit: boolean
  showArc: boolean
  progressRatio: number
  centerLabel?: string | null
  isDisabled?: boolean
  showCheckBadge?: boolean
  pulse?: boolean
  glow?: boolean
  onClick?: () => void
  ariaLabel?: string
  className?: string
}

interface SizeTokens {
  outer: number
  inner: number
  emojiPx: number
  initialPx: number
  badgePx: number
  radiusClass: string
  badgeIconPx: number
}

const SIZES: Record<HabitAvatarTileSize, SizeTokens> = {
  sm: { outer: 44, inner: 40, emojiPx: 18, initialPx: 16, badgePx: 14, radiusClass: 'rounded-[12px]', badgeIconPx: 9 },
  md: { outer: 56, inner: 52, emojiPx: 22, initialPx: 20, badgePx: 18, radiusClass: 'rounded-[14px]', badgeIconPx: 11 },
}

const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif'

/**
 * The "Avatar + Arc" tile that anchors every habit card. Holds either the
 * user-picked emoji or the title's initial fallback, optionally wraps a
 * progress arc around itself, and can be tapped to log the habit.
 *
 * One accent surface per card lives here — everything else on the card stays
 * neutral. See `apps/web/components/habits/habit-card.tsx`.
 */
export function HabitAvatarTile({
  icon,
  title,
  size = 'md',
  isCompleted,
  isOverdue,
  isBadHabit,
  showArc,
  progressRatio,
  centerLabel,
  isDisabled = false,
  showCheckBadge = false,
  pulse = false,
  glow = false,
  onClick,
  ariaLabel,
  className = '',
}: HabitAvatarTileProps) {
  const t = useTranslations()
  const tokens = SIZES[size]
  const initial = getHabitInitial(title)
  const hasIcon = !!(icon && icon.trim().length > 0)
  const isInteractive = typeof onClick === 'function'

  const innerLabel = hasIcon ? icon : initial

  const arcDasharray = useMemo(
    () => getHabitProgressStrokeDasharray(progressRatio * 100, isCompleted),
    [progressRatio, isCompleted],
  )

  // Surface tokens (one accent per card)
  let surfaceClass: string
  let textClass: string
  if (isCompleted) {
    surfaceClass = 'bg-primary text-white'
    textClass = 'text-white'
  } else if (isBadHabit) {
    surfaceClass = 'bg-[rgb(var(--color-destructive-rgb)/0.12)] text-destructive'
    textClass = 'text-destructive'
  } else {
    surfaceClass = 'bg-primary/[0.14] text-primary'
    textClass = 'text-primary'
  }

  // Subtle 1px gradient border: primary → primary/60 in the active state;
  // muted neutral ring otherwise. Uses `ring-*` so the tile's radius
  // is respected without extra math.
  let ringClass = 'ring-1 ring-primary/25'
  if (isCompleted) {
    ringClass = 'ring-1 ring-primary/40'
  } else if (isBadHabit) {
    ringClass = 'ring-1 ring-[rgb(var(--color-destructive-rgb)/0.25)]'
  }
  if (isOverdue && !isCompleted) {
    ringClass = 'ring-1 ring-[rgb(var(--color-destructive-rgb)/0.45)]'
  }

  const accessibleLabel =
    ariaLabel ??
    (hasIcon
      ? `${title} - ${t('habits.emojiPicker.title')}`
      : `${title} - ${t('habits.form.iconNone')}`)

  const tile = (
    <span
      role={isInteractive ? undefined : 'img'}
      aria-label={isInteractive ? undefined : accessibleLabel}
      aria-hidden={isInteractive ? true : undefined}
      className={`habit-avatar-hover-shadow relative inline-flex items-center justify-center ${tokens.radiusClass} ${surfaceClass} ${ringClass} habit-avatar-inner-highlight font-semibold leading-none select-none transition-all duration-200`}
      style={{
        width: tokens.inner,
        height: tokens.inner,
        fontSize: hasIcon ? tokens.emojiPx : tokens.initialPx,
        fontFamily: hasIcon ? EMOJI_FONT : undefined,
      }}
    >
      <span aria-hidden="true">{innerLabel}</span>
      {centerLabel ? (
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center ${textClass} text-[10px] font-bold tabular-nums`}
          style={{ background: 'inherit' }}
          aria-hidden="true"
        >
          {centerLabel}
        </span>
      ) : null}
    </span>
  )

  const shouldRenderArcFill = showArc && (isCompleted || progressRatio > 0)
  const arc = shouldRenderArcFill ? (
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
  ) : null

  const badge = showCheckBadge ? (
    <span
      className="pointer-events-none absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full bg-primary text-white shadow-sm ring-2 ring-[var(--color-surface)]"
      style={{ width: tokens.badgePx, height: tokens.badgePx }}
      aria-hidden="true"
    >
      <Check width={tokens.badgeIconPx} height={tokens.badgeIconPx} />
    </span>
  ) : null

  const wrapperClass = `relative inline-flex items-center justify-center ${
    pulse ? 'animate-habit-tile-pop' : ''
  } ${glow ? 'animate-habit-tile-glow' : ''} ${className}`

  if (isInteractive) {
    return (
      <button
        type="button"
        data-no-drag
        onClick={(e) => {
          e.stopPropagation()
          if (isDisabled) return
          onClick?.()
        }}
        disabled={isDisabled}
        aria-label={accessibleLabel}
        aria-pressed={isCompleted}
        className={`${wrapperClass} cursor-pointer bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] rounded-[14px] disabled:cursor-default`}
        style={{ width: tokens.outer, height: tokens.outer }}
      >
        {arc}
        {tile}
        {badge}
      </button>
    )
  }

  return (
    <span
      className={wrapperClass}
      style={{ width: tokens.outer, height: tokens.outer }}
    >
      {arc}
      {tile}
      {badge}
    </span>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { getHabitInitial } from '@orbit/shared/utils'

type HabitAvatarTileSize = 'sm' | 'md'

interface HabitAvatarTileProps {
  icon: string | null | undefined
  title: string
  size?: HabitAvatarTileSize
  isCompleted?: boolean
  isBadHabit?: boolean
  className?: string
}

interface SizeTokens {
  inner: number
  emojiPx: number
  initialPx: number
  radiusClass: string
}

const SIZES: Record<HabitAvatarTileSize, SizeTokens> = {
  sm: { inner: 40, emojiPx: 18, initialPx: 16, radiusClass: 'rounded-[12px]' },
  md: { inner: 52, emojiPx: 22, initialPx: 20, radiusClass: 'rounded-[14px]' },
}

const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif'

/**
 * Decorative emoji tile that sits immediately to the right of the log button
 * on every habit card. Shows the user-picked emoji or the title initial as a
 * fallback. Purely presentational — interaction (log / finalize) lives in
 * {@link HabitLogButton} so the emoji can stay a stable identity anchor.
 */
export function HabitAvatarTile({
  icon,
  title,
  size = 'md',
  isCompleted = false,
  isBadHabit = false,
  className = '',
}: Readonly<HabitAvatarTileProps>) {
  const t = useTranslations()
  const tokens = SIZES[size]
  const initial = getHabitInitial(title)
  const hasIcon = !!(icon && icon.trim().length > 0)
  const innerLabel = hasIcon ? icon : initial

  let surfaceClass: string
  if (isCompleted) {
    surfaceClass = 'bg-primary text-white'
  } else if (isBadHabit) {
    surfaceClass = 'bg-[rgb(var(--color-destructive-rgb)/0.12)] text-destructive'
  } else {
    surfaceClass = 'bg-primary/[0.14] text-primary'
  }

  const accessibleLabel = hasIcon
    ? `${title} - ${t('habits.emojiPicker.title')}`
    : `${title} - ${t('habits.form.iconNone')}`

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      className={`relative inline-flex items-center justify-center overflow-hidden select-none font-semibold leading-none ${tokens.radiusClass} ${surfaceClass} habit-avatar-inner-highlight ${className}`}
      style={{
        width: tokens.inner,
        height: tokens.inner,
        fontSize: hasIcon ? tokens.emojiPx : tokens.initialPx,
        fontFamily: hasIcon ? EMOJI_FONT : undefined,
      }}
    >
      <span aria-hidden="true">{innerLabel}</span>
    </span>
  )
}

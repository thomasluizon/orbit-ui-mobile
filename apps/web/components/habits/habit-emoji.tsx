'use client'

import { useTranslations } from 'next-intl'
import { getHabitInitial } from '@orbit/shared/utils'

type HabitEmojiSize = 'sm' | 'md' | 'lg'

interface HabitEmojiProps {
  icon: string | null | undefined
  title: string
  size?: HabitEmojiSize
  filled?: boolean
  className?: string
  badHabit?: boolean
  overdue?: boolean
}

const TILE_CLASSES: Record<HabitEmojiSize, string> = {
  sm: 'size-10 rounded-[var(--radius-lg)] text-[18px]',
  md: 'size-[52px] rounded-[var(--radius-xl)] text-[22px]',
  lg: 'size-16 rounded-[var(--radius-xl)] text-[26px]',
}

/**
 * Renders the habit avatar tile: emoji when icon is set, otherwise the first
 * grapheme of the title in the accent color. Used in the card, detail drawer,
 * summary strip, and the picker trigger.
 */
export function HabitEmoji({
  icon,
  title,
  size = 'md',
  filled = false,
  className = '',
  badHabit = false,
  overdue = false,
}: HabitEmojiProps) {
  const t = useTranslations()
  const initial = getHabitInitial(title)
  const hasIcon = !!(icon && icon.trim().length > 0)
  const accessibleLabel = hasIcon
    ? t('habits.emojiPicker.title')
    : t('habits.form.iconNone')

  let tint = filled ? 'bg-primary text-text-inverse' : 'bg-primary/[0.14] text-primary'
  if (badHabit && !filled) {
    tint = 'bg-[rgb(var(--color-destructive-rgb)/0.12)] text-destructive'
  }
  const ring = overdue
    ? 'ring-1 ring-[rgb(var(--color-destructive-rgb)/0.35)]'
    : 'ring-1 ring-border-muted'

  return (
    <span
      role="img"
      aria-label={`${title} - ${accessibleLabel}`}
      className={`relative inline-flex items-center justify-center ${TILE_CLASSES[size]} ${tint} ${ring} font-semibold leading-none select-none ${className}`}
      style={{
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif',
      }}
    >
      <span aria-hidden="true">{hasIcon ? icon : initial}</span>
    </span>
  )
}

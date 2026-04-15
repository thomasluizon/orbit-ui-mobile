'use client'

import { useTranslations } from 'next-intl'

type HabitAvatarTileSize = 'sm' | 'md'

interface HabitAvatarTileProps {
  icon: string | null | undefined
  title: string
  size?: HabitAvatarTileSize
  className?: string
}

interface SizeTokens {
  slot: number
  emojiPx: number
}

const SIZES: Record<HabitAvatarTileSize, SizeTokens> = {
  sm: { slot: 40, emojiPx: 18 },
  md: { slot: 52, emojiPx: 26 },
}

const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif'

/**
 * The habit's emoji identity — rendered as a bare glyph, no container. The log
 * button owns the "action" surface; this is pure personality, so it sits as a
 * floating character next to it, not boxed in.
 *
 * The card omits this component entirely when the habit has no icon, so we
 * never render a fallback letter or an empty slot.
 */
export function HabitAvatarTile({
  icon,
  title,
  size = 'md',
  className = '',
}: Readonly<HabitAvatarTileProps>) {
  const t = useTranslations()
  const tokens = SIZES[size]
  const hasIcon = !!(icon && icon.trim().length > 0)
  if (!hasIcon) return null

  const accessibleLabel = `${title} - ${t('habits.emojiPicker.title')}`

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      className={`inline-flex items-center justify-center select-none leading-none ${className}`}
      style={{
        width: tokens.slot,
        height: tokens.slot,
        fontSize: tokens.emojiPx,
        fontFamily: EMOJI_FONT,
      }}
    >
      <span aria-hidden="true">{icon}</span>
    </span>
  )
}

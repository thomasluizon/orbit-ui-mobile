import { useCallback } from 'react'
import EmojiPicker, { en, pt, type EmojiType } from 'rn-emoji-keyboard'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitEmojiPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
}

/**
 * Notion-style full-color Unicode emoji picker for mobile. Uses
 * rn-emoji-keyboard's default EmojiPicker which provides its own modal
 * surface, search, categories, recents, and skin-tone selector -- themed
 * against our active color scheme tokens.
 */
export function HabitEmojiPicker({ open, onClose, onSelect }: HabitEmojiPickerProps) {
  const { colors } = useAppTheme()
  const { i18n } = useTranslation()

  const handleSelect = useCallback(
    (emoji: EmojiType) => {
      if (emoji?.emoji) onSelect(emoji.emoji)
    },
    [onSelect],
  )

  const locale = i18n.language?.toLowerCase() ?? 'en'
  const translation = locale.startsWith('pt') ? pt : en

  return (
    <EmojiPicker
      open={open}
      onClose={onClose}
      onEmojiSelected={handleSelect}
      enableSearchBar
      enableRecentlyUsed
      expandable
      categoryPosition="top"
      translation={translation}
      theme={{
        backdrop: 'rgba(0,0,0,0.5)',
        knob: colors.borderEmphasis,
        container: colors.surface,
        header: colors.textMuted,
        skinTonesContainer: colors.surfaceElevated,
        category: {
          icon: colors.textSecondary,
          iconActive: colors.textInverse,
          container: colors.surfaceElevated,
          containerActive: colors.primary,
        },
        search: {
          background: colors.surfaceElevated,
          text: colors.textPrimary,
          placeholder: colors.textMuted,
          icon: colors.textMuted,
        },
        emoji: {
          selected: colors.primary,
        },
      }}
    />
  )
}

'use client'

import { useCallback } from 'react'
import { EmojiPicker, type Locale as FrimousseLocale } from 'frimousse'
import { useLocale, useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { useEmojiRecents } from '@/hooks/use-emoji-recents'

interface HabitEmojiPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (emoji: string | null) => void
  currentIcon?: string | null
}

const SUPPORTED_LOCALES: ReadonlyArray<FrimousseLocale> = [
  'bn', 'da', 'de', 'en-gb', 'en', 'es-mx', 'es', 'et', 'fi', 'fr', 'hi', 'hu',
  'it', 'ja', 'ko', 'lt', 'ms', 'nb', 'nl', 'pl', 'pt', 'ru', 'sv', 'th', 'uk',
  'vi', 'zh-hant', 'zh',
]

function resolveFrimousseLocale(locale: string): FrimousseLocale {
  const normalized = locale.toLowerCase()
  if (SUPPORTED_LOCALES.includes(normalized as FrimousseLocale)) {
    return normalized as FrimousseLocale
  }
  // pt-BR -> pt (frimousse ships pt only)
  const base = normalized.split('-')[0]
  if (base && SUPPORTED_LOCALES.includes(base as FrimousseLocale)) {
    return base as FrimousseLocale
  }
  return 'en'
}

/**
 * Notion-style full-color Unicode emoji picker rendered inside AppOverlay.
 * Persists recents to localStorage and passes the raw emoji grapheme back to
 * the caller. Pass `null` via `onSelect` to clear the icon.
 */
export function HabitEmojiPicker({
  open,
  onOpenChange,
  onSelect,
  currentIcon,
}: HabitEmojiPickerProps) {
  const t = useTranslations()
  const locale = useLocale()
  const { recents, addEmoji } = useEmojiRecents()

  const handleSelect = useCallback(
    (emoji: string) => {
      addEmoji(emoji)
      onSelect(emoji)
      onOpenChange(false)
    },
    [addEmoji, onSelect, onOpenChange],
  )

  const handleClear = useCallback(() => {
    onSelect(null)
    onOpenChange(false)
  }, [onSelect, onOpenChange])

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('habits.emojiPicker.title')}
      description={t('habits.form.iconHint')}
    >
      <div className="flex h-[460px] flex-col">
        <EmojiPicker.Root
          locale={resolveFrimousseLocale(locale)}
          onEmojiSelect={({ emoji }) => handleSelect(emoji)}
          className="flex h-full w-full flex-col gap-3 text-[15px] text-text-primary"
        >
          <EmojiPicker.Search
            placeholder={t('habits.emojiPicker.searchPlaceholder')}
            className="form-input h-10 text-sm placeholder:text-text-muted"
          />

          {recents.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="form-label text-[11px] uppercase tracking-wide text-text-muted">
                {t('habits.emojiPicker.recents')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {recents.slice(0, 12).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={emoji}
                    onClick={() => handleSelect(emoji)}
                    className="inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-surface-elevated text-[20px] leading-none transition-colors hover:bg-primary/[0.12]"
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <EmojiPicker.Viewport className="relative flex-1 outline-none">
            <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
              <span>…</span>
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
              {t('habits.emojiPicker.noResults')}
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="select-none pb-2"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    {...props}
                    className="sticky top-0 z-10 bg-surface/95 px-1 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted backdrop-blur-sm"
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div {...props} className="flex gap-1">
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    {...props}
                    type="button"
                    className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[20px] leading-none transition-colors data-[active]:bg-primary/[0.14] hover:bg-surface-elevated focus:bg-surface-elevated focus:outline-none"
                  >
                    <span aria-hidden="true">{emoji.emoji}</span>
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>

          <div className="flex items-center justify-between gap-2 border-t border-border-muted pt-3">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-9 items-center rounded-[var(--radius-md)] px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50"
              disabled={!currentIcon}
            >
              {t('habits.emojiPicker.clear')}
            </button>
            <EmojiPicker.SkinToneSelector
              aria-label={t('habits.emojiPicker.skinTone')}
              className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-surface-elevated px-3 text-sm text-text-secondary transition-colors hover:bg-surface-elevated/80"
            />
          </div>
        </EmojiPicker.Root>
      </div>
    </AppOverlay>
  )
}

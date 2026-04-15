'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EmojiPicker,
  type Locale as FrimousseLocale,
  useActiveEmoji,
} from 'frimousse'
import { Search } from 'lucide-react'
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
 * Persists recents to localStorage and passes the raw emoji grapheme back
 * to the caller. Pass `null` via `onSelect` to clear the icon.
 *
 * Visual polish:
 *  - Properly centered panel (AppOverlay + dialog[open] reset in globals.css).
 *  - Hovered/focused emoji name bar in the footer (Notion-style).
 *  - Search input with a leading magnifier and a soft focus ring.
 *  - Scroll-shadow strip at the top of the grid when the list is scrolled.
 *  - "No results" empty state uses a subtle glyph illustration.
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
      <div className="flex h-[480px] flex-col">
        <EmojiPicker.Root
          locale={resolveFrimousseLocale(locale)}
          onEmojiSelect={({ emoji }) => handleSelect(emoji)}
          className="flex h-full w-full flex-col gap-3 text-[15px] text-text-primary"
        >
          {/* Search with leading icon + soft focus ring.
              The wrapper is `relative` and the icon is absolutely positioned
              inside it (vertically centered via top-1/2 + -translate-y-1/2).
              We intentionally do NOT use the `form-input` utility here because
              its `px-4` was colliding with the pl-10 override in some CSS
              orderings, making the magnifier sit on top of the placeholder.
              Padding-left is explicit: `pl-10` (2.5rem) = 12px (icon left)
              + 16px (icon width) + 8px gap. */}
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            >
              <Search className="size-4" />
            </span>
            <EmojiPicker.Search
              placeholder={t('habits.emojiPicker.searchPlaceholder')}
              className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface py-3 pl-10 pr-3 text-sm text-text-primary placeholder-text-muted transition-all duration-200 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {recents.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="habit-type-chip">
                {t('habits.emojiPicker.recents')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {recents.slice(0, 12).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={emoji}
                    onClick={() => handleSelect(emoji)}
                    className="inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-surface-elevated text-[20px] leading-none transition-colors hover:bg-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <EmojiGrid
            noResultsLabel={t('habits.emojiPicker.noResults')}
            noResultsHint={t('habits.emojiPicker.noResultsHint')}
          />

          {/* Hovered / focused emoji name bar (Notion-style) */}
          <ActiveEmojiNameBar
            placeholder={t('habits.emojiPicker.hoverHint')}
          />

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
              className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-surface-elevated px-3 text-sm text-text-secondary transition-colors hover:bg-surface-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>
        </EmojiPicker.Root>
      </div>
    </AppOverlay>
  )
}

/**
 * The emoji grid with a subtle top scroll shadow that fades in when the
 * list is scrolled, giving visual depth without being busy.
 */
function EmojiGrid({
  noResultsLabel,
  noResultsHint,
}: Readonly<{ noResultsLabel: string; noResultsHint: string }>) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onScroll = () => {
      setScrolled(el.scrollTop > 4)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <EmojiPicker.Viewport
      ref={viewportRef}
      className="relative flex-1 outline-none"
    >
      <span
        className="emoji-picker-scroll-shadow"
        data-visible={scrolled}
        aria-hidden="true"
      />
      <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
        <span>…</span>
      </EmojiPicker.Loading>
      <EmojiPicker.Empty className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-muted">
        <span aria-hidden="true" className="text-3xl opacity-60">
          ∅
        </span>
        <span className="font-medium text-text-secondary">{noResultsLabel}</span>
        <span className="text-xs text-text-muted">{noResultsHint}</span>
      </EmojiPicker.Empty>
      <EmojiPicker.List
        className="select-none pb-2"
        components={{
          CategoryHeader: ({ category, ...props }) => (
            <div
              {...props}
              className="sticky top-0 z-10 bg-surface-overlay/95 px-1 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted backdrop-blur-sm"
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
              className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[20px] leading-none transition-colors data-[active]:bg-primary/[0.16] hover:bg-surface-elevated focus:bg-surface-elevated focus:outline-none"
            >
              <span aria-hidden="true">{emoji.emoji}</span>
            </button>
          ),
        }}
      />
    </EmojiPicker.Viewport>
  )
}

/**
 * A slim footer bar that shows the currently hovered or keyboard-focused
 * emoji's name (and its unicode-ish shortcode hint). Falls back to a
 * placeholder prompt when nothing is hovered.
 */
function ActiveEmojiNameBar({ placeholder }: Readonly<{ placeholder: string }>) {
  const active = useActiveEmoji()
  return (
    <div className="emoji-picker-name-bar" aria-live="polite">
      {active ? (
        <>
          <span className="emoji-picker-name-bar-emoji" aria-hidden="true">
            {active.emoji}
          </span>
          <span className="emoji-picker-name-bar-label">{active.label}</span>
          <span className="emoji-picker-name-bar-hint">
            :{slugifyLabel(active.label)}:
          </span>
        </>
      ) : (
        <span className="emoji-picker-name-bar-label text-text-muted">
          {placeholder}
        </span>
      )}
    </div>
  )
}

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28)
}

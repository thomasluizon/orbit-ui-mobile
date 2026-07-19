'use client'

import { Bell, X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { RadioGlyph } from '@/components/ui/select-check'
import { Badge } from '@/components/ui/badge'
import { plural } from '@/lib/plural'
import { formatCalendarSyncRecurrenceLabel } from '@orbit/shared/utils'
import type { CalendarSyncEvent } from '@orbit/shared'

interface CalendarSyncEventRowProps {
  event: CalendarSyncEvent
  selected: boolean
  isReviewMode: boolean
  suggestionId: string | null
  dismissPending: boolean
  onToggle: (id: string) => void
  onDismiss: (suggestionId: string) => void
  t: ReturnType<typeof useTranslations>
}

export function CalendarSyncEventRow({
  event,
  selected,
  isReviewMode,
  suggestionId,
  dismissPending,
  onToggle,
  onDismiss,
  t,
}: Readonly<CalendarSyncEventRowProps>) {
  return (
    <div
      className="flex items-start transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
      style={{
        gap: 12,
        padding: '0 20px',
        borderBottom: '1px solid var(--hairline)',
        background: selected
          ? 'rgba(var(--primary-rgb), 0.06)'
          : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(event.id)}
        aria-pressed={selected}
        className="flex-1 min-w-0 text-left flex items-start appearance-none border-0 bg-transparent cursor-pointer"
        style={{ gap: 14, padding: '14px 0' }}
      >
        <span className="shrink-0" style={{ marginTop: 1 }}>
          <RadioGlyph selected={selected} size={24} />
        </span>
        <span className="flex-1 min-w-0 block">
          <span
            className="block truncate"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {event.title}
          </span>
          <span
            className="flex flex-wrap items-center"
            style={{ gap: 8, marginTop: 4 }}
          >
            {event.startDate && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {event.startDate}
              </span>
            )}
            {event.startTime && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
              </span>
            )}
            {event.isRecurring && (
              <Badge tone="soft">
                {formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
                  translate: (key, values) => t(key as never, values as never),
                  pluralize: plural,
                }) || t('calendar.recurring')}
              </Badge>
            )}
            {event.reminders.length > 0 && (
              <span
                className="inline-flex items-center"
                style={{
                  gap: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Bell className="size-3" aria-hidden />
                {event.reminders.length}
              </span>
            )}
            {event.calendarName && (
              <span
                className="truncate"
                style={{
                  maxWidth: 160,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--fg-3)',
                }}
              >
                {event.calendarName}
              </span>
            )}
          </span>
          {event.description && (
            <span
              className="block line-clamp-1"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
                marginTop: 4,
              }}
            >
              {event.description}
            </span>
          )}
        </span>
      </button>

      {isReviewMode && suggestionId && (
        <button
          type="button"
          onClick={() => onDismiss(suggestionId)}
          disabled={dismissPending}
          aria-label={t('calendar.autoSync.dismissSuggestion')}
          className="icon-btn touch-target shrink-0 hover:text-[var(--status-bad)] disabled:opacity-50"
          style={{ width: 36, height: 36, marginTop: 8, color: 'var(--fg-4)' }}
        >
          <X size={18} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    </div>
  )
}

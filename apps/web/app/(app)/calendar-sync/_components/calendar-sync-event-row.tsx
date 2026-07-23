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

function resolveWhenLabel(event: CalendarSyncEvent): string {
  const timeRange = event.startTime
    ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
    : ''
  return [event.startDate, timeRange].filter(Boolean).join(' · ')
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
  const whenLabel = resolveWhenLabel(event)

  return (
    <div
      className="flex items-start transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
      style={{
        gap: 12,
        padding: '12px 20px',
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
        style={{ gap: 12, padding: 0 }}
      >
        <span className="shrink-0">
          <RadioGlyph selected={selected} size={24} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
          <span className="t-row block truncate">{event.title}</span>
          {event.description && (
            <span className="t-secondary block line-clamp-1">{event.description}</span>
          )}
          <span className="flex flex-wrap items-center" style={{ gap: 8 }}>
            {whenLabel && <span className="t-meta">{whenLabel}</span>}
            {event.isRecurring && (
              <Badge tone="soft">
                {formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
                  translate: (key, values) => t(key as never, values as never),
                  pluralize: plural,
                }) || t('calendar.recurring')}
              </Badge>
            )}
            {event.reminders.length > 0 && (
              <span className="t-meta inline-flex items-center" style={{ gap: 4 }}>
                <Bell className="size-3" aria-hidden />
                {event.reminders.length}
              </span>
            )}
            {event.calendarName && (
              <span className="t-meta max-w-40 truncate">{event.calendarName}</span>
            )}
          </span>
        </span>
      </button>

      {isReviewMode && suggestionId && (
        <button
          type="button"
          onClick={() => onDismiss(suggestionId)}
          disabled={dismissPending}
          aria-label={t('calendar.autoSync.dismissSuggestion')}
          className="icon-btn touch-target shrink-0 hover:text-[var(--status-bad)] disabled:opacity-50"
          style={{ width: 36, height: 36, color: 'var(--fg-4)' }}
        >
          <X size={18} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    </div>
  )
}

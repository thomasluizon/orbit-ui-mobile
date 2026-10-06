'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useDateFormat } from '@/hooks/use-date-format'
import { useTimeFormat } from '@/hooks/use-time-format'

import { useId, useState } from 'react'
import { Bell, ChevronDown, X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { RadioGlyph } from '@/components/ui/select-check'
import { Badge } from '@/components/ui/badge'
import { plural } from '@/lib/plural'
import {
  formatCalendarSyncRecurrenceLabel,
  getCalendarSyncImportIssue,
  getCalendarSyncImportIssueMessageKey,
} from '@orbit/shared/utils'
import type { CalendarSyncEvent } from '@orbit/shared'

interface CalendarSyncEventRowProps {
  event: CalendarSyncEvent
  weekStartDay: 0 | 1
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
  weekStartDay,
  selected,
  isReviewMode,
  suggestionId,
  dismissPending,
  onToggle,
  onDismiss,
  t,
}: Readonly<CalendarSyncEventRowProps>) {
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()
  const calendarNameId = `${titleId}-calendar`
  const descriptionIds = [titleId, event.calendarName ? calendarNameId : null].filter(Boolean).join(' ')
  const { displayTime } = useTimeFormat()
  const { displayDate } = useDateFormat()
  const importIssue = getCalendarSyncImportIssue(
    event.recurrenceRule,
    event.startDate,
    event.startTime,
    event.startUtc,
    event.recurrenceTimeZone,
    weekStartDay,
  )
  const importIssueLabel = importIssue
    ? t(getCalendarSyncImportIssueMessageKey(importIssue))
    : null
  const importIssueId = importIssue ? `calendar-import-issue-${event.id}` : undefined

  return (
    <div
      className="flex flex-wrap items-start"
      data-focus-inset=""
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        background: importIssue
          ? 'var(--bg-elev)'
          : selected
            ? 'rgba(var(--primary-rgb), 0.06)'
            : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(event.id)}
        disabled={importIssue !== null}
        aria-pressed={selected}
        aria-describedby={importIssueId}
        className="flex-1 min-w-0 text-left flex items-start appearance-none border-0 bg-transparent cursor-pointer rounded-[12px] transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed"
        style={{ gap: 12, padding: 12, paddingInlineStart: 16, paddingInlineEnd: isReviewMode && suggestionId ? 0 : 16 }}
      >
        <span
          className="shrink-0"
          style={{ marginTop: 0, opacity: importIssue ? 0.5 : 1 }}
        >
          <RadioGlyph selected={selected} size={24} />
        </span>
        <span className="flex-1 min-w-0 block">
          <PersonalText id={titleId}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              fontWeight: 500,
              color: importIssue ? 'var(--fg-3)' : 'var(--fg-1)',
            }}
          >{event.title}</PersonalText>
          <span
            className="flex flex-wrap items-center"
            style={{ gap: 8, marginTop: 4 }}
          >
            {event.startDate && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--fg-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayDate(event.startDate, { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
            {event.startTime && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--fg-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayTime(event.startTime)}{event.endTime ? ` - ${displayTime(event.endTime)}` : ''}
              </span>
            )}
            {event.isRecurring && (
              <Badge >
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
                  color: 'var(--fg-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Bell className="size-3" aria-hidden />
                {event.reminders.length}
              </span>
            )}
            {event.calendarName && (
              <PersonalText id={calendarNameId}
                className="min-w-0"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--fg-2)',
                }}
              >{event.calendarName}</PersonalText>
            )}
          </span>
          {event.description && (
            <span
              className="block whitespace-pre-line [overflow-wrap:anywhere]"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--fg-2)',
                marginTop: 4,
              }}
            >
              {event.description}
            </span>
          )}
          {importIssueLabel ? (
            <span
              id={importIssueId}
              className="block"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--status-bad-text)',
                marginTop: 4,
              }}
            >
              {importIssueLabel}
            </span>
          ) : null}
        </span>
      </button>

      <button type="button" aria-label={t('contextMenu.viewDetails')} aria-describedby={descriptionIds} aria-expanded={expanded} aria-controls={`${titleId}-details`} onClick={() => setExpanded(!expanded)} className="icon-btn touch-target shrink-0" style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, color: 'var(--fg-3)' }}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></button>
      {isReviewMode && suggestionId && (
        <button
          type="button"
          onClick={() => onDismiss(suggestionId)}
          disabled={dismissPending}
          aria-label={t('calendar.autoSync.dismissSuggestion')}
          className="icon-btn touch-target group/dismiss shrink-0 disabled:opacity-50"
          style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, marginTop: 8, marginInlineStart: 12, marginInlineEnd: 16, color: 'var(--fg-3)' }}
        >
          <X size={20} strokeWidth={1.8} aria-hidden className="transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover/dismiss:text-[var(--status-bad)]" />
        </button>
      )}
      <div id={`${titleId}-details`} hidden={!expanded} className="min-w-0 w-full" data-calendar-event-disclosure="">{expanded ? <><PersonalText expanded>{event.title}</PersonalText>{event.calendarName ? <PersonalText expanded>{event.calendarName}</PersonalText> : null}</> : null}</div>
    </div>
  )
}

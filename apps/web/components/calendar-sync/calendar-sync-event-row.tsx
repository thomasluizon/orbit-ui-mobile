'use client'

import { PersonalTextAction } from '@/components/ui/personal-text-action'
import { PersonalText } from '@/components/ui/personal-text'

import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useDateFormat } from '@/hooks/use-date-format'
import { useTimeFormat } from '@/hooks/use-time-format'

import { useId, useState, type CSSProperties } from 'react'
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
  initiallyExpanded?: boolean
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
  initiallyExpanded = false,
  isReviewMode,
  suggestionId,
  dismissPending,
  onToggle,
  onDismiss,
  t,
}: Readonly<CalendarSyncEventRowProps>) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
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

  const dateLabel = event.startDate ? displayDate(event.startDate, { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const timeLabel = event.startTime ? `${displayTime(event.startTime)}${event.endTime ? ` - ${displayTime(event.endTime)}` : ''}` : ''
  const recurrenceLabel = event.isRecurring ? formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
    translate: (key, values) => t(key as never, values as never),
    pluralize: plural,
  }) || t('calendar.recurring') : ''
  const accessibleLabel = [event.title, dateLabel, timeLabel, recurrenceLabel, event.reminders.length ? String(event.reminders.length) : '', event.calendarName, importIssueLabel].filter(Boolean).join(' ')

  return (
    <div
      className="orbit-list-row-column flex flex-wrap items-start gap-x-4"
      data-focus-inset=""
      style={{
        borderRadius: 12,
      }}
    >
      <PersonalTextAction className="flex-1" label={accessibleLabel} contentClassName="flex items-start" contentStyle={{ gap: 12, paddingBlock: SPACING.s12, minHeight: TOUCH_TARGET_MIN }} controlDecoration={<span aria-hidden="true" data-press-fill="" className="orbit-list-row-outset overflow-hidden bg-[var(--calendar-event-fill)]" />} control={<button
        type="button"
        onClick={() => onToggle(event.id)}
        disabled={importIssue !== null}
        aria-pressed={selected}
        aria-describedby={importIssueId}
        className="orbit-list-row-body flex-1 min-w-0 text-start flex items-start appearance-none border-0 bg-transparent cursor-pointer rounded-[12px] transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] enabled:hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed"
        style={{ gap: 12, paddingBlock: SPACING.s12, '--calendar-event-fill': importIssue ? 'var(--bg-elev)' : selected ? 'rgba(var(--primary-rgb), 0.06)' : 'transparent' } as CSSProperties}
      >
        <span data-slot="list-row-content" id={`${titleId}-details`} data-calendar-event-disclosure="" className="flex-1 min-w-0 block">
          <PersonalText id={titleId}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              fontWeight: 500,
              color: importIssue ? 'var(--fg-3)' : 'var(--fg-1)',
              paddingInline: SPACING.s0,
            }}
           expanded={expanded}>{event.title}</PersonalText>
          <span
            className="flex flex-wrap items-center"
            style={{ gap: 8, marginTop: SPACING.s4 }}
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
                {dateLabel}
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
                {timeLabel}
              </span>
            )}
            {event.isRecurring && (
              <Badge >
                {recurrenceLabel}
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
                <Bell size={16} aria-hidden="true" />
                {event.reminders.length}
              </span>
            )}
            {event.calendarName && (
              <PersonalText expanded={expanded} id={calendarNameId}
                className="min-w-0"
                style={{
                  fontFamily: 'var(--font-sans)',
                  paddingInline: SPACING.s0,
                  fontSize: 12,
                  color: 'var(--fg-2)',
                }}
              >{event.calendarName}</PersonalText>
            )}
          </span>
          {importIssueLabel ? (
            <span
              data-slot="calendar-import-issue"
              id={importIssueId}
              className="block"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--status-bad-text)',
                marginTop: SPACING.s4,
              }}
            >
              {importIssueLabel}
            </span>
          ) : null}
        </span>
        <span
          className="relative shrink-0"
          style={{ marginTop: SPACING.s0, opacity: importIssue ? 0.5 : 1 }}
        >
          <RadioGlyph selected={selected} size={24} />
        </span>
      </button>} />

      <button type="button" aria-label={t('contextMenu.viewDetails')} aria-describedby={descriptionIds} aria-expanded={expanded} aria-controls={`${titleId}-details`} onClick={() => setExpanded(!expanded)} className="icon-btn touch-target shrink-0" style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, color: 'var(--fg-3)' }}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></button>
      {isReviewMode && suggestionId && (
        <button
          type="button"
          onClick={() => onDismiss(suggestionId)}
          disabled={dismissPending}
          aria-label={t('calendar.autoSync.dismissSuggestion')}
          className="icon-btn touch-target group/dismiss shrink-0 disabled:opacity-50"
          style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, marginTop: SPACING.s8, color: 'var(--fg-3)' }}
        >
          <X size={20} strokeWidth={1.8} aria-hidden className="transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover/dismiss:text-[var(--status-bad)]" />
        </button>
      )}
    </div>
  )
}

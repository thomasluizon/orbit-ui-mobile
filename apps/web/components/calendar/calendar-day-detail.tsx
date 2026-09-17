'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import {
  determineHabitDayStatus,
  filterRecurringEntries,
  parseAPIDate,
  type CalendarEventsDisplayState,
} from '@orbit/shared/utils'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import { CheckRow } from '@/components/ui/check-row'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { ErrorState } from '@/components/ui/error-state'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusRing } from '@/components/ui/status-ring'
import { ShowRecurringToggle } from '@/components/calendar/show-recurring-toggle'
import { EventRow } from '@/components/dates/event-row'
import { CalendarSyncBoundary } from '@/components/calendar/calendar-sync-boundary'

interface CalendarDayDetailProps {
  dateStr: string | null
  entries: CalendarDayEntry[]
  calendarEvents: CalendarSyncEvent[]
  autoSyncState: CalendarAutoSyncState | undefined
  calendarEventsState: CalendarEventsDisplayState
  onRetryCalendarEvents: () => void
  onReconnectCalendarEvents: () => void
  onViewPro: () => void
  loggable: boolean
  showRecurring: boolean
  pendingEntryStates: ReadonlyMap<string, boolean>
  onShowRecurringChange: (value: boolean) => void
  onCalendarAutoSyncChange: (value: boolean) => Promise<void>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  showRecurringToggle?: boolean
  /** Desktop side-panel mode: the entries list scrolls within the viewport and
   * the go-to-day row stays pinned below it. */
  fitViewport?: boolean
}

function CalendarEventsSection({
  calendarEvents,
  state,
  onRetry,
  onReconnect,
  onViewPro,
  proActionVariant,
}: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  state: CalendarEventsDisplayState
  onRetry: () => void
  onReconnect: () => void
  onViewPro: () => void
  proActionVariant: 'primary' | 'secondary'
}>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()

  if (state === 'pro-boundary') {
    return (
      <div data-testid="calendar-pro-boundary" style={{ paddingInline: 16 }}>
        <CapacityNotice
          message={t('calendar.proBoundary.title')}
          body={t('calendar.proBoundary.body')}
          action={
            /* eslint-disable-next-line local/max-button-words -- ORB-50 owns this granted canvas label. */
            <PillButton variant={proActionVariant} size="sm" onClick={onViewPro}>
              {t('calendar.proBoundary.action')}
            </PillButton>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 8, paddingInline: 16 }}>
      <p className="text-sm font-medium text-[var(--fg-2)]" style={{ margin: 0, lineHeight: 1.4 }}>
        {t('calendar.dayDetail.eventsTitle')}
      </p>
      {state === 'loading' ? (
        <Skeleton variant="settings" rows={1} label={t('calendar.fetchingEvents')} />
      ) : null}
      {state === 'failed' ? (
        <ErrorState
          message={t('calendar.fetchError')}
          action={
            <PillButton variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
          }
        />
      ) : null}
      {state === 'not-connected' ? (
        <div className="flex flex-col items-center text-center" style={{ gap: 12, paddingBlock: 24 }}>
          <p className="text-sm font-medium text-[var(--fg-1)]" style={{ margin: 0 }}>
            {t('calendar.dayDetail.disconnectedTitle')}
          </p>
          <p className="text-sm text-[var(--fg-3)]" style={{ margin: 0, lineHeight: 1.5 }}>
            {t('calendar.dayDetail.disconnectedBody')}
          </p>
          <PillButton variant="ghost" onClick={onReconnect}>
            {t('calendar.autoSync.reconnectCta')}
          </PillButton>
        </div>
      ) : null}
      {state === 'ready' && calendarEvents.length === 0 ? (
        <p className="text-center text-sm text-[var(--fg-3)]" style={{ margin: 0, paddingBlock: 24 }}>
          {t('calendar.dayDetail.noEventsToImport')}
        </p>
      ) : null}
      {state === 'ready' && calendarEvents.length > 0 ? (
        <div className="flex flex-col" style={{ gap: 4 }}>
          {calendarEvents.map((event) =>
            event.startTime ? (
              <EventRow
                key={event.id}
                time={displayTime(event.startTime)}
                title={event.title}
                source={t('calendar.title')}
              />
            ) : (
              <EventRow
                key={event.id}
                allDayLabel={t('calendar.timeGrid.allDay')}
                title={event.title}
                source={t('calendar.title')}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

type EntryOutcome = {
  label: string
  status: NonNullable<StatusRingProps['status']>
}

function getEntryOutcome(
  entry: CalendarDayEntry,
  t: ReturnType<typeof useTranslations>,
): EntryOutcome {
  if (entry.status === 'upcoming') {
    return {
      label: t('calendar.status.upcoming'),
      status: 'empty',
    }
  }

  const completed = entry.status === 'completed'

  if (entry.isBadHabit) {
    return {
      label: t(completed ? 'calendar.status.indulged' : 'calendar.status.resisted'),
      status: completed ? 'bad' : 'done',
    }
  }

  return {
    label: t(completed ? 'calendar.status.completed' : 'calendar.status.missed'),
    status: completed ? 'done' : 'empty',
  }
}

function CalendarDayCheckRow({
  dateStr,
  entry,
  displayTime,
  isPending,
  pendingChecked,
  onEntryChange,
  t,
}: Readonly<{
  dateStr: string
  entry: CalendarDayEntry
  displayTime: (time: string) => string
  isPending: boolean
  pendingChecked: boolean | undefined
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  t: ReturnType<typeof useTranslations>
}>) {
  const sourceChecked = entry.status === 'completed'
  const displayedChecked = pendingChecked === undefined || pendingChecked === sourceChecked
    ? null
    : pendingChecked
  const checked = displayedChecked ?? sourceChecked
  const displayedEntry: CalendarDayEntry = displayedChecked === null
    ? entry
    : {
        ...entry,
        status: displayedChecked
          ? 'completed'
          : determineHabitDayStatus(parseAPIDate(dateStr), false),
      }
  const outcome = getEntryOutcome(displayedEntry, t)
  const value = entry.dueTime
    ? `${displayTime(entry.dueTime)} · ${outcome.label}`
    : outcome.label

  async function changeChecked(nextChecked: boolean) {
    const entryChange = onEntryChange(entry, nextChecked)
    if (!entryChange) return
    await entryChange.catch(() => undefined)
  }

  return (
    <CheckRow
      label={entry.title}
      checked={checked}
      value={value}
      loading={isPending}
      onChange={(nextChecked) => void changeChecked(nextChecked)}
    />
  )
}

function CalendarDayRows({
  dateStr,
  entries,
  loggable,
  displayTime,
  pendingEntryStates,
  onEntryChange,
  t,
}: Readonly<{
  dateStr: string
  entries: CalendarDayEntry[]
  loggable: boolean
  displayTime: (time: string) => string
  pendingEntryStates: ReadonlyMap<string, boolean>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  t: ReturnType<typeof useTranslations>
}>) {
  return entries.map((entry) => {
    const entryKey = getCalendarEntryMutationKey(dateStr, entry.habitId)
    const outcome = getEntryOutcome(entry, t)
    const value = entry.dueTime
      ? `${displayTime(entry.dueTime)} · ${outcome.label}`
      : outcome.label

    if (loggable) {
      return (
        <CalendarDayCheckRow
          key={`${dateStr}:${entry.habitId}`}
          dateStr={dateStr}
          entry={entry}
          displayTime={displayTime}
          isPending={pendingEntryStates.has(entryKey)}
          pendingChecked={pendingEntryStates.get(entryKey)}
          onEntryChange={onEntryChange}
          t={t}
        />
      )
    }

    return (
      <ListRow
        key={`${dateStr}:${entry.habitId}`}
        title={entry.title}
        value={value}
        trailing={<StatusRing status={outcome.status} size={24} label={outcome.label} />}
        chevron={false}
        readOnly
      />
    )
  })
}

export function CalendarDayDetail({
  dateStr,
  entries,
  calendarEvents,
  autoSyncState,
  calendarEventsState,
  onRetryCalendarEvents,
  onReconnectCalendarEvents,
  onViewPro,
  loggable,
  showRecurring,
  pendingEntryStates,
  onShowRecurringChange,
  onCalendarAutoSyncChange,
  onEntryChange,
  showRecurringToggle = true,
  fitViewport = false,
}: Readonly<CalendarDayDetailProps>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()

  const formattedDate = useMemo(() => {
    if (!dateStr) return ''
    return displayWeekdayDate(parseAPIDate(dateStr))
  }, [dateStr, displayWeekdayDate])

  const filteredEntries = useMemo(
    () => filterRecurringEntries(entries, showRecurring),
    [entries, showRecurring],
  )

  if (!dateStr) return null

  const completedCount = filteredEntries.filter((entry) => entry.status === 'completed').length
  const summary = filteredEntries.length > 0
    ? t('calendar.dayDetail.completionSummary', {
        done: completedCount,
        total: filteredEntries.length,
      })
    : t('calendar.dayDetail.nothingDue')

  const recurringToggle = showRecurringToggle && entries.length > 0 ? (
    <div
      className="flex shrink-0 justify-end"
      style={{ marginBottom: 12, paddingInline: 16 }}
    >
      <ShowRecurringToggle checked={showRecurring} onChange={onShowRecurringChange} />
    </div>
  ) : null

  const body = (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex flex-col" style={{ gap: 16, paddingInline: 16 }}>
        <p className="text-sm text-[var(--fg-3)]" style={{ margin: 0 }}>
          {summary}
        </p>
        {filteredEntries.length === 0 ? (
          <p
            className="text-center text-sm text-[var(--fg-3)]"
            style={{ margin: 0, paddingBlock: 24 }}
          >
            {t('calendar.noHabitsScheduled')}
          </p>
        ) : null}
      </div>
      {filteredEntries.length > 0 ? (
        <div>
          <CalendarDayRows
            dateStr={dateStr}
            entries={filteredEntries}
            loggable={loggable}
            displayTime={displayTime}
            pendingEntryStates={pendingEntryStates}
            onEntryChange={onEntryChange}
            t={t}
          />
        </div>
      ) : null}
      <CalendarEventsSection
        calendarEvents={calendarEvents}
        state={calendarEventsState}
        onRetry={onRetryCalendarEvents}
        onReconnect={onReconnectCalendarEvents}
        onViewPro={onViewPro}
        proActionVariant={fitViewport ? 'secondary' : 'primary'}
      />
      {calendarEventsState !== 'pro-boundary' ? (
        <div style={{ paddingInline: 16 }}>
          <CalendarSyncBoundary
            autoSyncState={autoSyncState}
            displayTime={displayTime}
            onAutoSyncChange={onCalendarAutoSyncChange}
          />
        </div>
      ) : null}
    </div>
  )

  const goToDay = (
    <Link
      href={`/?date=${dateStr}`}
      aria-label={t('calendar.goToDay')}
      className="block"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <ListRow
        icon="external-link"
        title={t('calendar.goToDay')}
        chevron={false}
        readOnly
      />
    </Link>
  )

  if (fitViewport) {
    return (
      <section
        aria-label={formattedDate}
        className="flex min-h-0 flex-1 flex-col rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
        style={{ paddingBlock: 16 }}
      >
        {recurringToggle}
        <div className="relative min-h-0 flex-1">
          <div
            data-calendar-day-scroll
            className="h-full overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 8 }}
          >
            {body}
          </div>
        </div>
        {goToDay}
      </section>
    )
  }

  return (
    <section
      aria-label={formattedDate}
      className="rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
      style={{ paddingBlock: 16 }}
    >
      {recurringToggle}
      {body}
      {goToDay}
    </section>
  )
}

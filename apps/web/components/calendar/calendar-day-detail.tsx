'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useTimeFormat } from '@/hooks/use-time-format'
import {
  formatCalendarDayTitle,
  filterRecurringEntries,
  type CalendarEventsDisplayState,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import { CheckRow } from '@/components/ui/check-row'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { CalendarDayEvents } from '@/components/calendar/calendar-day-events'
import { ListRow } from '@/components/ui/list-row'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusRing } from '@/components/ui/status-ring'

interface CalendarDayDetailProps {
  dateStr: string | null
  today: string
  entries: CalendarDayEntry[]
  calendarEvents: CalendarSyncEvent[]
  showEventSource?: boolean
  calendarEventsState: CalendarEventsDisplayState
  onRetryCalendarEvents: () => void
  onReconnectCalendarEvents: () => void
  onOpenCalendarImport: (eventId: string | null) => void
  onViewPro: () => void
  onOpenEvents?: () => void
  onOpenHabitTitle?: (title: string) => void
  loggable: boolean
  showRecurring: boolean
  pendingEntryStates: ReadonlyMap<string, boolean>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  showTitle?: boolean
}

function CalendarEventsSection({ calendarEvents, showEventSource, state, onRetry, onReconnect, onOpenImport, onOpenEvents, onViewPro }: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  showEventSource: boolean
  state: CalendarEventsDisplayState
  onRetry: () => void
  onReconnect: () => void
  onOpenImport: (eventId: string | null) => void
  onViewPro: () => void
  onOpenEvents?: () => void
}>) {
  const t = useTranslations()
  const wide = useIsWideDesktop()
  if (state === 'pro-boundary') return <CapacityNotice
    message={t('calendar.proBoundary.title')}
    body={t('calendar.proBoundary.body')}
    // eslint-disable-next-line local/max-button-words -- #1341 requires the granted calendar boundary action.
    action={<PillButton size="sm" variant={wide ? 'secondary' : 'primary'} onClick={onViewPro}>{t('calendar.proBoundary.action')}</PillButton>}
  />
  if (state === 'not-connected') return <div>
    <ListRow textMode="label" title={t('calendar.calendars.title')} onClick={onReconnect} />
  </div>
  return <div className="flex flex-col gap-2">
    <p className="text-sm font-medium text-[var(--fg-2)]" style={{ margin: 0, lineHeight: 1.4 }}>{t('calendar.dayDetail.eventsTitle')}</p>
    {state === 'loading' ? <div><Skeleton variant="settings" rows={1} label={t('calendar.fetchingEvents')} /></div> : null}
    {state === 'failed' ? <div className="flex flex-col gap-2"><p role="alert" className="m-0 text-base text-[var(--fg-1)]">{t('calendar.fetchError')}</p><ListRow textMode="label" title={t('common.retry')} onClick={onRetry} /></div> : null}
    {state === 'ready' && calendarEvents.length === 0 ? <p className="m-0 text-sm text-[var(--fg-3)]">{t('calendar.dayDetail.noEventsToImport')}</p> : null}
    {state === 'ready' && calendarEvents.length > 0 ? <CalendarDayEvents calendarEvents={calendarEvents} showEventSource={showEventSource} onOpenImport={onOpenImport} onOpenEvents={onOpenEvents} /> : null}
  </div>
}

type EntryOutcome = {
  ringLabel: string
  status: NonNullable<StatusRingProps['status']>
}

function getEntryOutcome(
  entry: CalendarDayEntry,
  t: ReturnType<typeof useTranslations>,
): EntryOutcome {
  const completed = entry.status === 'completed'

  if (entry.isBadHabit) {
    const label = t(completed ? 'calendar.status.indulged' : 'calendar.status.resisted')
    return {
      ringLabel: entry.status === 'upcoming' ? t('calendar.status.missed') : label,
      status: completed ? 'bad' : entry.status === 'upcoming' ? 'empty' : 'done',
    }
  }

  const label = t(completed ? 'calendar.status.completed' : 'calendar.status.missed')
  return {
    ringLabel: label,
    status: completed ? 'done' : 'empty',
  }
}

function CalendarDayCheckRow({
  entry,
  displayTime,
  isPending,
  pendingChecked,
  onEntryChange,
  onOpenTitle,
}: Readonly<{
  entry: CalendarDayEntry
  displayTime: (time: string) => string
  isPending: boolean
  pendingChecked: boolean | undefined
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onOpenTitle: (title: string) => void
}>) {
  const sourceChecked = entry.status === 'completed'
  const displayedChecked = pendingChecked === undefined || pendingChecked === sourceChecked
    ? null
    : pendingChecked
  const checked = displayedChecked ?? sourceChecked
  const value = entry.dueTime ? displayTime(entry.dueTime) : undefined

  async function changeChecked(nextChecked: boolean) {
    const entryChange = onEntryChange(entry, nextChecked)
    if (!entryChange) return
    await entryChange.catch(() => undefined)
  }

  return (
    <CheckRow
      label={entry.title}
      textMode="personal"
      onOpenLabel={() => onOpenTitle(entry.title)}
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
  onOpenTitle,
  t,
}: Readonly<{
  dateStr: string
  entries: CalendarDayEntry[]
  loggable: boolean
  displayTime: (time: string) => string
  pendingEntryStates: ReadonlyMap<string, boolean>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onOpenTitle: (title: string) => void
  t: ReturnType<typeof useTranslations>
}>) {
  return entries.map((entry) => {
    const entryKey = getCalendarEntryMutationKey(dateStr, entry.habitId)
    const outcome = getEntryOutcome(entry, t)
    const value = entry.dueTime ? displayTime(entry.dueTime) : undefined

    if (loggable) {
      return (
        <CalendarDayCheckRow
          key={`${dateStr}:${entry.habitId}`}
          entry={entry}
          displayTime={displayTime}
          isPending={pendingEntryStates.has(entryKey)}
          pendingChecked={pendingEntryStates.get(entryKey)}
          onEntryChange={onEntryChange}
          onOpenTitle={onOpenTitle}
        />
      )
    }

    return (
      <button key={`${dateStr}:${entry.habitId}`} type="button" aria-label={`${entry.title}, ${outcome.ringLabel}`} onClick={() => onOpenTitle(entry.title)} className="min-h-[68px] w-full overflow-hidden rounded-[12px] border-0 p-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="flex min-w-0 items-start gap-2 px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <PersonalText className=" text-base  text-[var(--fg-1)]">{entry.title}</PersonalText>
            {value ? <span className="font-mono text-sm tabular-nums text-[var(--fg-2)]">{value}</span> : null}
          </span>
          <StatusRing status={outcome.status} size={24} label={outcome.ringLabel} />
        </span>
      </button>
    )
  })
}

export function CalendarDayDetail({
  dateStr,
  today,
  entries,
  calendarEvents,
  showEventSource = false,
  calendarEventsState,
  onRetryCalendarEvents,
  onReconnectCalendarEvents,
  onOpenCalendarImport,
  onViewPro,
  onOpenEvents,
  onOpenHabitTitle,
  loggable,
  showRecurring,
  pendingEntryStates,
  onEntryChange,
  showTitle = true,
}: Readonly<CalendarDayDetailProps>) {
  const [expandedTitle, setExpandedTitle] = useAccountScopedState<string | null>(null)
  const { sheetRef } = useSheetHost()
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const locale = useLocale()

  const formattedDate = useMemo(() => {
    if (!dateStr) return ''
    return formatCalendarDayTitle(dateStr, locale, today, (date) => t('dates.todayWithDate', { date }))
  }, [dateStr, locale, today, t])

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

  const goToDay = (
    // eslint-disable-next-line local/max-button-words -- #927 follows the granted calendar drawing.
    <ListRow
      compact
      href={`/?date=${dateStr}`}
      accessibilityLabel={t('calendar.goToDay')}
      icon="external-link"
      title={t('calendar.goToDay')}
      textMode="label"
      chevron={false}
    />
  )

  const body = (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {showTitle ? <h2 className="text-xl font-medium text-[var(--fg-1)]" style={{ margin: 0 }}>{formattedDate}</h2> : null}
        <p className="font-mono text-xs text-[var(--fg-3)]" style={{ margin: 0 }}>
          {summary}
        </p>
      </div>
      {filteredEntries.length === 0 ? (
        <p className="m-0 text-sm text-[var(--fg-3)]">{t('calendar.noHabitsScheduled')}</p>
      ) : null}
      {filteredEntries.length > 0 ? (
        <div className="flex flex-col">
          <CalendarDayRows
            dateStr={dateStr}
            entries={filteredEntries}
            loggable={loggable}
            displayTime={displayTime}
            pendingEntryStates={pendingEntryStates}
            onEntryChange={onEntryChange}
            onOpenTitle={onOpenHabitTitle ?? setExpandedTitle}
            t={t}
          />
        </div>
      ) : null}
      {goToDay}
      <CalendarEventsSection
        key={dateStr}
        calendarEvents={calendarEvents}
        showEventSource={showEventSource}
        state={calendarEventsState}
        onRetry={onRetryCalendarEvents}
        onReconnect={onReconnectCalendarEvents}
        onOpenImport={onOpenCalendarImport}
        onOpenEvents={onOpenEvents}
        onViewPro={onViewPro}
      />

    </div>
  )



  return (
    <section
      aria-label={formattedDate}
      data-field-surface="card"
      className="rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
      style={{ padding: 24 }}
    >
      {body}
      {expandedTitle ? <Sheet ref={sheetRef} open title={t('habits.form.title')} onClose={() => setExpandedTitle(null)}>
        <PersonalText expanded className="text-base text-[var(--fg-1)]">{expandedTitle}</PersonalText>
      </Sheet> : null}
    </section>
  )
}

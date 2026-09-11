'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { parseAPIDate, filterRecurringEntries } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { StatusRing } from '@/components/ui/status-ring'
import { ShowRecurringToggle } from '@/components/calendar/show-recurring-toggle'

interface CalendarDayDetailProps {
  dateStr: string | null
  entries: CalendarDayEntry[]
  loggable: boolean
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => void
  /** Desktop side-panel mode: the entries list scrolls within the viewport and
   * the go-to-day row stays pinned below it. */
  fitViewport?: boolean
}

type EntryOutcome = {
  label: string
  status: NonNullable<StatusRingProps['status']>
}

function getEntryOutcome(
  entry: CalendarDayEntry,
  t: ReturnType<typeof useTranslations>,
): EntryOutcome {
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

function CalendarDayRows({
  entries,
  loggable,
  displayTime,
  onEntryChange,
  t,
}: Readonly<{
  entries: CalendarDayEntry[]
  loggable: boolean
  displayTime: (time: string) => string
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => void
  t: ReturnType<typeof useTranslations>
}>) {
  return entries.map((entry) => {
    const outcome = getEntryOutcome(entry, t)
    const value = entry.dueTime
      ? `${displayTime(entry.dueTime)} · ${outcome.label}`
      : outcome.label

    if (loggable) {
      return (
        <CheckRow
          key={entry.habitId}
          label={entry.title}
          checked={entry.status === 'completed'}
          value={value}
          onChange={(checked) => onEntryChange(entry, checked)}
        />
      )
    }

    return (
      <ListRow
        key={entry.habitId}
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
  loggable,
  showRecurring,
  onShowRecurringChange,
  onEntryChange,
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

  const recurringToggle = entries.length > 0 ? (
    <div className="flex shrink-0 justify-end" style={{ marginBottom: 12 }}>
      <ShowRecurringToggle checked={showRecurring} onChange={onShowRecurringChange} />
    </div>
  ) : null

  const body = (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p className="text-sm text-[var(--fg-3)]" style={{ margin: 0 }}>
        {summary}
      </p>
      {filteredEntries.length === 0 ? (
        <p className="text-center text-sm text-[var(--fg-3)]" style={{ margin: 0, paddingBlock: 24 }}>
          {t('calendar.noHabitsScheduled')}
        </p>
      ) : (
        <div style={{ marginInline: -16 }}>
          <CalendarDayRows
            entries={filteredEntries}
            loggable={loggable}
            displayTime={displayTime}
            onEntryChange={onEntryChange}
            t={t}
          />
        </div>
      )}
    </div>
  )

  const goToDay = (
    <div style={{ marginInline: -16 }}>
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
    </div>
  )

  if (fitViewport) {
    return (
      <section
        aria-label={formattedDate}
        className="flex min-h-0 flex-1 flex-col rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
        style={{ padding: 16 }}
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
      style={{ padding: 16 }}
    >
      {recurringToggle}
      {body}
      {goToDay}
    </section>
  )
}

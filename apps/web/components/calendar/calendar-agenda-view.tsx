'use client'

import { useState } from 'react'
import { CalendarEntryDetails } from './calendar-entry-details'
import { addDays, eachDayOfInterval } from 'date-fns'
import { useLocale, useTranslations } from 'next-intl'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { calendarEntryOutcome, formatCalendarAgendaHeading, formatAPIDate, orderCalendarDayEntries } from '@orbit/shared/utils'
import { StatusRing } from '@/components/ui/status-ring'
import { X } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { Skeleton } from '@/components/ui/skeleton'

interface CalendarAgendaViewProps {
  startDate: Date
  dayMap: ReadonlyMap<string, CalendarDayEntry[]>
  displayTime: (time: string) => string
  todayKey: string
  isLoading: boolean
  loadingLabel: string
}

export function CalendarAgendaView({
  startDate,
  dayMap,
  displayTime,
  todayKey,
  isLoading,
  loadingLabel,
}: Readonly<CalendarAgendaViewProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const [selectedEntry, setSelectedEntry] = useState<CalendarDayEntry | null>(null)
  const dates = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) })

  return (
    <div
      data-testid="calendar-agenda-view"
      aria-busy={isLoading}
      className="flex max-w-[560px] flex-col"
      style={{ gap: 16, padding: '0 16px 24px' }}
    >
      {isLoading ? dates.map((date, index) => (
        <div key={formatAPIDate(date)} data-testid="calendar-agenda-loading-day">
          {index === 0 ? (
            <Skeleton variant="habit-row" label={loadingLabel} />
          ) : (
            <Skeleton variant="habit-row" grouped />
          )}
        </div>
      )) : dates.map((date) => {
        const entries = orderCalendarDayEntries(dayMap.get(formatAPIDate(date)) ?? [])
        const heading = formatCalendarAgendaHeading(formatAPIDate(date), locale, todayKey, (date) => t('dates.todayWithDate', { date }))

        return (
          <section
            key={formatAPIDate(date)}
            data-testid="calendar-agenda-day"
            className="flex min-w-0 flex-col"
            style={{ gap: 4 }}
          >
            <h2
              style={{
                margin: 0,
                color: 'var(--fg-2)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.875rem',
                fontWeight: 500,
                lineHeight: 1.55,
              }}
            >
              {heading}
            </h2>
            {entries.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--fg-3)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.875rem',
                  lineHeight: 1.55,
                }}
              >
                {t('calendar.agenda.empty')}
              </p>
            ) : (
              <div>
                {entries.map((entry) => {
                  const outcome = calendarEntryOutcome(entry)
                  return (
                  <ListRow
                    key={entry.habitId}
                    title={entry.title}
                    value={entry.dueTime ? displayTime(entry.dueTime) : t('calendar.timeGrid.noSetTime')}
                    wrapValue
                    textMode="personal"
                    chevron={false}
                    trailing={<span aria-hidden="true" className="relative inline-flex">
                      <StatusRing status={outcome.status} size={24} label={t(outcome.labelKey)} />
                      {outcome.status === 'bad' ? <span className="absolute inset-0 flex items-center justify-center"><X size={16} color="var(--status-bad)" strokeWidth={1.5} /></span> : null}
                    </span>}
                    accessibilityLabel={entry.dueTime
                      ? t('calendar.agenda.timedEntryLabel', { title: entry.title, time: displayTime(entry.dueTime) })
                      : entry.title}
                    onClick={() => setSelectedEntry(entry)}
                  />
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
      {selectedEntry ? <CalendarEntryDetails entries={[selectedEntry]} title={t('calendar.entryDetails')} displayTime={displayTime} onClose={() => setSelectedEntry(null)} /> : null}
    </div>
  )
}

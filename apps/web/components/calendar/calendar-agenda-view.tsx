'use client'

import { addDays, eachDayOfInterval } from 'date-fns'
import { useTranslations } from 'next-intl'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { capitalizeFirstLetter, formatAPIDate } from '@orbit/shared/utils'
import { ListRow } from '@/components/ui/list-row'
import { Skeleton } from '@/components/ui/skeleton'

interface CalendarAgendaViewProps {
  startDate: Date
  dayMap: ReadonlyMap<string, CalendarDayEntry[]>
  displayTime: (time: string) => string
  displayWeekdayDate: (date: Date, long?: boolean) => string
  todayKey: string
  isLoading: boolean
  loadingLabel: string
}

export function CalendarAgendaView({
  startDate,
  dayMap,
  displayTime,
  displayWeekdayDate,
  todayKey,
  isLoading,
  loadingLabel,
}: Readonly<CalendarAgendaViewProps>) {
  const t = useTranslations()
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
        const entries = dayMap.get(formatAPIDate(date)) ?? []
        const dateLabel = capitalizeFirstLetter(displayWeekdayDate(date, true))
        const heading = formatAPIDate(date) === todayKey
          ? `${t('calendar.agenda.today')}, ${dateLabel}`
          : dateLabel

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
                fontSize: 14,
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
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {t('calendar.agenda.empty')}
              </p>
            ) : (
              <div>
                {entries.map((entry) => (
                  <ListRow
                    key={entry.habitId}
                    title={entry.title}
                    value={entry.dueTime ? displayTime(entry.dueTime) : undefined}
                    readOnly
                    wrapTitle
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

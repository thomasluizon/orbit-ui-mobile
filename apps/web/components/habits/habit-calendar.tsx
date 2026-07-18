'use client'

import { useState, useMemo, useCallback } from 'react'
import { addMonths, subMonths, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import {
  buildHabitCalendarDayCells,
  buildHabitCalendarWeekdayKeys,
  buildHabitLogDateSet,
} from '@orbit/shared/utils'
import { useHabitLogs } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { useTimeFormat } from '@/hooks/use-time-format'
import type { HabitLog } from '@orbit/shared/types/calendar'

interface HabitCalendarProps {
  habitId: string
  logs?: HabitLog[] | null
}

const navButtonClass = 'icon-btn text-[var(--fg-2)] hover:text-[var(--fg-1)]'

export function HabitCalendar({ habitId, logs: externalLogs }: Readonly<HabitCalendarProps>) {
  const t = useTranslations()
  const { displayMonthYear, displayDate } = useDateFormat()
  const { displayTime } = useTimeFormat()

  const { data: fetchedLogs } = useHabitLogs(externalLogs ? null : habitId)
  const logs = useMemo<HabitLog[]>(() => externalLogs ?? fetchedLogs ?? [], [externalLogs, fetchedLogs])
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 1

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const logDates = useMemo(() => buildHabitLogDateSet(logs), [logs])

  const monthLabel = useMemo(
    () => displayMonthYear(currentMonth),
    [currentMonth, displayMonthYear],
  )

  const weekdays = useMemo(
    () =>
      buildHabitCalendarWeekdayKeys(weekStartsOn).map((key) => ({
        key,
        label: t(`dates.daysShort.${key}`).charAt(0),
      })),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [t, weekStartsOn],
  )

  const calendarDays = useMemo(
    () => buildHabitCalendarDayCells(currentMonth, weekStartsOn, logDates),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [currentMonth, logDates, weekStartsOn],
  )

  const totalInMonth = useMemo(
    () => calendarDays.filter((day) => day.isCurrentMonth && day.isCompleted).length,
    [calendarDays],
  )

  const selectedDayLogs = useMemo<HabitLog[]>(() => {
    if (!selectedDate) return []
    return logs.filter((log) => log.date === selectedDate)
  }, [logs, selectedDate])

  const prevMonth = useCallback(() => {
    setCurrentMonth((m) => subMonths(m, 1))
    setSelectedDate(null)
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1))
    setSelectedDate(null)
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(new Date())
    setSelectedDate(null)
  }, [])

  const toggleDay = useCallback((dateStr: string) => {
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
  }, [])

  function formatLogTime(createdAtUtc: string): string {
    const date = parseISO(createdAtUtc)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return displayTime(`${hh}:${mm}`)
  }

  return (
    <div
      style={{
        borderRadius: 18,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        padding: '16px 14px',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          aria-label={t('common.previousMonth')}
          className={navButtonClass}
          onClick={prevMonth}
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label={`${monthLabel}, ${t('dates.goToToday')}`}
          className="capitalize appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-1)] hover:text-[var(--primary)] transition-colors"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500 }}
          onClick={goToToday}
        >
          {monthLabel}
        </button>
        <button
          type="button"
          aria-label={t('common.nextMonth')}
          className={navButtonClass}
          onClick={nextMonth}
        >
          <ChevronRight size={20} strokeWidth={1.8} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {weekdays.map((day) => (
          <div
            key={day.key}
            className="text-center uppercase py-1"
            style={{
              fontFamily: 'var(--font-mono)',
              // react-doctor-disable-next-line no-tiny-text -- intentional single-letter weekday header caption (mono meta scale per DESIGN.md), not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: 'var(--fg-3)',
            }}
          >
            {day.label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarDays.map((day) => (
          <div
            key={day.dateStr}
            className="aspect-square flex items-center justify-center relative"
          >
            {day.isCurrentMonth && day.isCompleted ? (
              <button
                type="button"
                className="group flex size-full appearance-none border-0 bg-transparent p-0 cursor-pointer items-center justify-center"
                onClick={() => toggleDay(day.dateStr)}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full bg-[var(--status-done)] text-[var(--fg-on-primary)] transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)] group-hover:scale-105 group-active:scale-[0.96] ${
                    selectedDate === day.dateStr
                      ? 'ring-2 ring-[var(--primary)]/50 ring-offset-2 ring-offset-[var(--bg)]'
                      : ''
                  }`}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {day.dayNum}
                </span>
              </button>
            ) : (
              <div
                className={`flex size-9 items-center justify-center rounded-full ${
                  day.isCurrentMonth ? '' : 'opacity-0'
                }`}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  color:
                    day.isCurrentMonth && day.isToday
                      ? 'var(--fg-1)'
                      : 'var(--fg-3)',
                  boxShadow:
                    day.isCurrentMonth && day.isToday
                      ? 'inset 0 0 0 1.5px var(--primary)'
                      : 'none',
                }}
              >
                {day.dayNum}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedDate && selectedDayLogs.length > 0 && (
        <div
          className="mt-3 overflow-hidden"
          style={{
            borderRadius: 14,
            background: 'var(--bg-field)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            padding: 12,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[var(--fg-1)]"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500 }}
            >
              {displayDate(parseISO(selectedDate))}
            </span>
            <button
              type="button"
              aria-label={t('common.close')}
              className="icon-btn text-[var(--fg-3)] hover:text-[var(--fg-1)]"
              onClick={() => setSelectedDate(null)}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {selectedDayLogs.map((log) => (
              <div key={log.id} className="flex flex-col gap-0.5">
                <span
                  className="text-[var(--fg-3)]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.02em',
                  }}
                >
                  {t('habits.detail.loggedAt', {
                    time: formatLogTime(log.createdAtUtc),
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="flex items-center justify-between mt-3 px-1"
        style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}
      >
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.08em',
            color: 'var(--fg-3)',
          }}
        >
          {t('calendar.completionHistory')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--status-done)',
          }}
        >
          {totalInMonth}{' '}
          {totalInMonth === 1 ? t('habits.detail.day') : t('habits.detail.days')}
        </span>
      </div>
    </div>
  )
}

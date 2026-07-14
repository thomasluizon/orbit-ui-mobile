'use client'

import { useMemo } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  getDate,
} from 'date-fns'
import { useTranslations } from 'next-intl'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useProfile } from '@/hooks/use-profile'
import { CalendarDayCell, type GridDay } from './calendar-day-cell'

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  /** Date string of the day whose detail panel is open (primary-filled pill). */
  selectedDateStr?: string | null
  /** Inclusive range endpoints (yyyy-MM-dd) for range-pick mode. When set, the
   *  grid renders an in-range band with highlighted endpoints. */
  rangeStart?: string | null
  rangeEnd?: string | null
  /** When true, suppresses status dots so the grid structure still renders
   *  while the month's data is loading. */
  isLoading?: boolean
}

export function CalendarGrid({
  currentMonth,
  dayMap,
  onSelectDay,
  selectedDateStr = null,
  rangeStart = null,
  rangeEnd = null,
  isLoading = false,
}: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 1

  const weekdayHeaders = useMemo(() => {
    const mondayFirst = [
      t('dates.daysShort.monday'),
      t('dates.daysShort.tuesday'),
      t('dates.daysShort.wednesday'),
      t('dates.daysShort.thursday'),
      t('dates.daysShort.friday'),
      t('dates.daysShort.saturday'),
      t('dates.daysShort.sunday'),
    ]
    if (weekStartsOn === 0) {
      return [
        t('dates.daysShort.sunday'),
        ...mondayFirst.slice(0, 6),
      ]
    }
    return mondayFirst
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn aliases profile.weekStartDay and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [weekStartsOn, t])

  const gridDays = useMemo<GridDay[]>(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn })

    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
      const dateStr = formatAPIDate(date)
      const entries = dayMap.get(dateStr) ?? []
      const completedCount = entries.filter((e) => e.status === 'completed').length
      const totalCount = entries.length

      return {
        date,
        dateStr,
        day: getDate(date),
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isToday(date),
        entries,
        completedCount,
        totalCount,
        completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
      }
    })
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn aliases profile.weekStartDay and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [currentMonth, dayMap, weekStartsOn])

  return (
    <div
      data-tour="tour-calendar-grid"
      style={{ padding: '20px 20px 10px' }}
    >
      <div
        style={{
          borderRadius: 18,
          padding: '18px 14px',
          background: 'var(--bg-card)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(7, 1fr)',
            marginBottom: 12,
          }}
        >
          {weekdayHeaders.map((day, i) => (
            <div
              key={`${day}-${i}`}
              className="text-center uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-3)',
                letterSpacing: '0.04em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {day}
            </div>
          ))}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 8 }}
        >
          {gridDays.map((cell, index) => (
            <CalendarDayCell
              key={cell.dateStr}
              cell={cell}
              index={index}
              selectedDateStr={selectedDateStr}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              isLoading={isLoading}
              onSelectDay={onSelectDay}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

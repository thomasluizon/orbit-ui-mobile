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
import { useDateFormat } from '@/hooks/use-date-format'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useProfile } from '@/hooks/use-profile'

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
}

interface GridDay {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  entries: CalendarDayEntry[]
  completedCount: number
  totalCount: number
  completionRatio: number
}

type DayStatus = 'empty' | 'full' | 'partial' | 'missed'

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return 'empty'
  if (cell.completedCount === cell.totalCount) return 'full'
  const hasMissed = cell.entries.some((e) => e.status === 'missed')
  if (hasMissed) return 'missed'
  return 'partial'
}

export function CalendarGrid({ currentMonth, dayMap, onSelectDay }: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const { displayWeekdayDate } = useDateFormat()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = (profile?.weekStartDay as 0 | 1) ?? 1

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
  }, [currentMonth, dayMap, weekStartsOn])

  return (
    <div
      data-tour="tour-calendar-grid"
      style={{ padding: '16px 20px 8px' }}
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
            className="text-center"
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 6 }}
      >
        {gridDays.map((cell, index) => {
          const canSelect = cell.isCurrentMonth
          const status = dayStatus(cell)

          return (
            <button
              type="button"
              key={cell.dateStr}
              data-tour={index === 0 ? 'tour-calendar-day' : undefined}
              aria-label={displayWeekdayDate(cell.date, true)}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-disabled={!canSelect}
              onClick={() => canSelect && onSelectDay(cell.dateStr)}
              className="relative flex flex-col items-center justify-center"
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                height: 40,
                gap: 3,
                borderRadius: 6,
                cursor: canSelect ? 'pointer' : 'default',
                color: cell.isCurrentMonth ? 'var(--fg-1)' : 'var(--fg-4)',
                opacity: cell.isCurrentMonth ? 1 : 0.5,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 13,
                  fontWeight: cell.isToday ? 600 : 400,
                  color:
                    cell.isCurrentMonth
                      ? status === 'empty' && !cell.isToday
                        ? 'var(--fg-3)'
                        : 'var(--fg-1)'
                      : 'var(--fg-4)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {cell.day}
              </span>
              <span aria-hidden="true" style={{ width: 5, height: 5 }}>
                {renderDot(cell.isToday ? 'today' : status)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function renderDot(kind: 'today' | DayStatus): React.ReactNode {
  if (kind === 'today') {
    return (
      <span
        className="block rounded-full"
        style={{ width: 5, height: 5, background: 'var(--primary)' }}
      />
    )
  }
  if (kind === 'full') {
    return (
      <span
        className="block rounded-full"
        style={{ width: 5, height: 5, background: 'var(--fg-1)' }}
      />
    )
  }
  if (kind === 'partial') {
    return (
      <span
        className="block rounded-full"
        style={{
          width: 5,
          height: 5,
          boxShadow: 'inset 0 0 0 1px var(--fg-3)',
        }}
      />
    )
  }
  if (kind === 'missed') {
    return (
      <span
        className="block rounded-full"
        style={{ width: 5, height: 5, background: 'var(--status-overdue)' }}
      />
    )
  }
  return null
}

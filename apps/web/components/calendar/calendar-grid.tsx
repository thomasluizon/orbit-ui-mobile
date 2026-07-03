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

function isInRange(dateStr: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false
  const lo = start <= end ? start : end
  const hi = start <= end ? end : start
  return dateStr >= lo && dateStr <= hi
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

function dayNumberColor(cell: GridDay, selected: boolean): string {
  if (selected || cell.isToday) return 'var(--fg-1)'
  if (!cell.isCurrentMonth) return 'var(--fg-4)'
  return 'var(--fg-2)'
}

function dayStatusLabel(status: DayStatus, t: ReturnType<typeof useTranslations>): string | null {
  if (status === 'full') return t('calendar.legend.done')
  if (status === 'partial') return t('calendar.legend.partial')
  if (status === 'missed') return t('calendar.legend.missed')
  return null
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
  const { displayWeekdayDate } = useDateFormat()
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
                fontSize: 11,
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
          {gridDays.map((cell, index) => {
            const canSelect = cell.isCurrentMonth
            const status = dayStatus(cell)
            const selected = canSelect && cell.dateStr === selectedDateStr
            const inRange = canSelect && isInRange(cell.dateStr, rangeStart, rangeEnd)
            const isEndpoint =
              canSelect && (cell.dateStr === rangeStart || cell.dateStr === rangeEnd)
            const highlighted = selected || isEndpoint
            const statusLabel = dayStatusLabel(status, t)
            const dayLabel = statusLabel
              ? `${displayWeekdayDate(cell.date, true)}, ${statusLabel}`
              : displayWeekdayDate(cell.date, true)

            return (
              <button
                type="button"
                key={cell.dateStr}
                data-tour={index === 0 ? 'tour-calendar-day' : undefined}
                aria-label={dayLabel}
                aria-current={cell.isToday ? 'date' : undefined}
                aria-disabled={!canSelect}
                tabIndex={!canSelect ? -1 : undefined}
                data-in-range={inRange ? 'true' : undefined}
                onClick={() => canSelect && onSelectDay(cell.dateStr)}
                className={
                  'relative flex flex-col items-center justify-center bg-transparent transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ' +
                  (canSelect ? 'hover:bg-[var(--bg-elev)] active:scale-[0.96]' : '')
                }
                style={{
                  appearance: 'none',
                  border: 0,
                  height: 44,
                  gap: 4,
                  borderRadius: 999,
                  cursor: canSelect ? 'pointer' : 'default',
                  opacity: cell.isCurrentMonth ? 1 : 0.5,
                  background: inRange
                    ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                    : undefined,
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 28,
                    height: 28,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    fontWeight: cell.isToday ? 700 : 500,
                    color: dayNumberColor(cell, highlighted),
                    fontVariantNumeric: 'tabular-nums',
                    background: highlighted ? 'var(--selection-bg)' : 'transparent',
                    boxShadow:
                      cell.isToday && !highlighted
                        ? 'inset 0 0 0 1.5px var(--primary)'
                        : 'none',
                  }}
                >
                  {cell.day}
                </span>
                <span aria-hidden="true" style={{ width: 6, height: 6 }}>
                  {isLoading
                    ? <span className="block rounded-full" style={{ width: 6, height: 6, background: 'var(--hairline)', opacity: 0.5 }} />
                    : renderDot(status)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function renderDot(kind: DayStatus): React.ReactNode {
  if (kind === 'full') {
    return (
      <span
        className="block rounded-full"
        style={{ width: 6, height: 6, background: 'var(--primary)' }}
      />
    )
  }
  if (kind === 'partial') {
    return (
      <span
        className="block rounded-full"
        style={{
          width: 6,
          height: 6,
          boxShadow: 'inset 0 0 0 1.5px var(--fg-4)',
        }}
      />
    )
  }
  if (kind === 'missed') {
    return (
      <span
        className="block rounded-full"
        style={{ width: 6, height: 6, background: 'var(--status-overdue)' }}
      />
    )
  }
  return null
}

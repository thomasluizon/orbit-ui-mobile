'use client'

import { useTranslations } from 'next-intl'
import { useDateFormat } from '@/hooks/use-date-format'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

export interface GridDay {
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

function isInRange(dateStr: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false
  const lo = start <= end ? start : end
  const hi = start <= end ? end : start
  return dateStr >= lo && dateStr <= hi
}

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

interface DayCellState {
  canSelect: boolean
  inRange: boolean
  highlighted: boolean
}

function resolveDayCellState(
  cell: GridDay,
  selectedDateStr: string | null,
  rangeStart: string | null,
  rangeEnd: string | null,
): DayCellState {
  const canSelect = cell.isCurrentMonth
  const selected = canSelect && cell.dateStr === selectedDateStr
  const inRange = canSelect && isInRange(cell.dateStr, rangeStart, rangeEnd)
  const isEndpoint = canSelect && (cell.dateStr === rangeStart || cell.dateStr === rangeEnd)
  const highlighted = selected || isEndpoint
  return { canSelect, inRange, highlighted }
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

interface CalendarDayCellProps {
  cell: GridDay
  index: number
  selectedDateStr?: string | null
  rangeStart?: string | null
  rangeEnd?: string | null
  isLoading?: boolean
  onSelectDay: (dateStr: string) => void
}

/** A single day cell in the month grid: number, selection/range highlight,
 *  and a status dot. Extracted from CalendarGrid so the grid stays flat. */
export function CalendarDayCell({
  cell,
  index,
  selectedDateStr = null,
  rangeStart = null,
  rangeEnd = null,
  isLoading = false,
  onSelectDay,
}: Readonly<CalendarDayCellProps>) {
  const t = useTranslations()
  const { displayWeekdayDate } = useDateFormat()

  const status = dayStatus(cell)
  const { canSelect, inRange, highlighted } = resolveDayCellState(
    cell,
    selectedDateStr,
    rangeStart,
    rangeEnd,
  )
  const statusLabel = dayStatusLabel(status, t)
  const dayLabel = statusLabel
    ? `${displayWeekdayDate(cell.date, true)}, ${statusLabel}`
    : displayWeekdayDate(cell.date, true)

  return (
    <button
      type="button"
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
}

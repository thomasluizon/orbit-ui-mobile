'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  buildCalendarMonthModel,
  buildDayCellAccessibleName,
  formatAPIDate,
  resolveDayCellOutcome,
  type CalendarMonthDay,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { DayCellWords, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
import { useDateFormat } from '@/hooks/use-date-format'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  selectedDateStr?: string | null
  rangeStart?: string | null
  rangeEnd?: string | null
  isLoading?: boolean
  weekStartsOn: 0 | 1
}

function isInRange(dateStr: string, rangeStart: string | null, rangeEnd: string | null): boolean {
  if (!rangeStart || !rangeEnd) return false
  const start = rangeStart < rangeEnd ? rangeStart : rangeEnd
  const end = rangeStart < rangeEnd ? rangeEnd : rangeStart
  return dateStr >= start && dateStr <= end
}

interface CalendarGridDayProps {
  cell: CalendarMonthDay
  future: boolean
  inRange: boolean
  isFirst: boolean
  isLoading: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  words: DayCellWords
  futureWord: string
  selectedWord: string
  label: string
}

function CalendarDayVisual({ cell, dayCell, future }: Readonly<{
  cell: CalendarMonthDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
}>) {
  if (!future || !cell.isCurrentMonth) return <DayCell {...dayCell} />
  return (
    <span
      style={{
        color: 'var(--fg-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {cell.day}
    </span>
  )
}

function CalendarDayButton({
  accessibleName,
  cell,
  onSelectDay,
  selected,
  selectedWord,
}: Readonly<{
  accessibleName: string
  cell: CalendarMonthDay
  onSelectDay: (dateStr: string) => void
  selected: boolean
  selectedWord: string
}>) {
  if (!cell.isCurrentMonth) return null
  const label = selected ? `${accessibleName}, ${selectedWord}` : accessibleName
  return (
    <button
      type="button"
      aria-current={cell.isToday ? 'date' : undefined}
      aria-label={label}
      aria-pressed={selected}
      data-calendar-date={cell.dateStr}
      onClick={() => onSelectDay(cell.dateStr)}
      className="absolute inset-0 rounded-full border-0 bg-transparent p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
    />
  )
}

function CalendarDayContent({
  accessibleName,
  cell,
  dayCell,
  future,
  onSelectDay,
  selected,
  selectedWord,
}: Readonly<{
  accessibleName: string
  cell: CalendarMonthDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  selectedWord: string
}>) {
  return (
    <>
      <span aria-hidden="true">
        <CalendarDayVisual cell={cell} dayCell={dayCell} future={future} />
      </span>
      <CalendarDayButton
        accessibleName={accessibleName}
        cell={cell}
        onSelectDay={onSelectDay}
        selected={selected}
        selectedWord={selectedWord}
      />
    </>
  )
}

function CalendarGridDay({
  cell,
  future,
  inRange,
  isFirst,
  isLoading,
  onSelectDay,
  selected,
  words,
  futureWord,
  selectedWord,
  label,
}: Readonly<CalendarGridDayProps>) {
  const dayCell: ReadOnlyDayCellProps = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today: cell.isToday,
    selectionTintedByParent: selected || inRange,
    outsideMonth: !cell.isCurrentMonth,
    label,
    words,
  }
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${dayCell.label}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome, false)

  return (
    <span
      data-in-range={inRange ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-tour={isFirst ? 'tour-calendar-day' : undefined}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        width: 44,
        height: 44,
        borderRadius: 999,
        background: selected || inRange ? 'var(--selection-bg)' : 'transparent',
        boxShadow: selected ? 'inset 0 0 0 2px var(--primary)' : 'none',
      }}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          data-testid="calendar-day-skeleton"
          style={{ display: 'block', width: 44, height: 44, borderRadius: 999, background: 'var(--bg-well)', opacity: cell.isCurrentMonth ? 1 : 0 }}
        />
      ) : (
        <CalendarDayContent
          accessibleName={accessibleName}
          cell={cell}
          dayCell={dayCell}
          future={future}
          onSelectDay={onSelectDay}
          selected={selected}
          selectedWord={selectedWord}
        />
      )}
    </span>
  )
}

export function CalendarGrid({
  currentMonth,
  dayMap,
  onSelectDay,
  selectedDateStr = null,
  rangeStart = null,
  rangeEnd = null,
  isLoading = false,
  weekStartsOn,
}: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const { displayWeekdayDate, displayMonthYear } = useDateFormat()
  const todayKey = formatAPIDate(new Date())

  const weekdayLabels = useMemo(() => {
    const mondayFirst = [
      t('dates.daysShort.monday'),
      t('dates.daysShort.tuesday'),
      t('dates.daysShort.wednesday'),
      t('dates.daysShort.thursday'),
      t('dates.daysShort.friday'),
      t('dates.daysShort.saturday'),
      t('dates.daysShort.sunday'),
    ]
    return weekStartsOn === 0 ? [mondayFirst[6]!, ...mondayFirst.slice(0, 6)] : mondayFirst
  }, [t, weekStartsOn])

  const { gridDays } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn),
    [currentMonth, dayMap, weekStartsOn],
  )

  const words: DayCellWords = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    readOnly: t('calendar.dayCell.readOnly'),
  }

  return (
    <div data-testid="calendar-grid" data-tour="tour-calendar-grid" style={{ padding: '16px 4px 8px' }}>
      <div data-testid="calendar-grid-card" style={{ borderRadius: 20, padding: 0, background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
        <MonthGrid weekdayLabels={weekdayLabels} gap={0} label={displayMonthYear(currentMonth)}>
          {gridDays.map((cell, index) => {
            const future = cell.dateStr > todayKey
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDateStr ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            return (
              <CalendarGridDay
                key={cell.dateStr}
                cell={cell}
                future={future}
                inRange={inRange}
                isFirst={index === 0}
                isLoading={isLoading}
                onSelectDay={onSelectDay}
                selected={selected}
                words={words}
                futureWord={t('calendar.dayCell.future')}
                selectedWord={t('calendar.dayCell.selected')}
                label={displayWeekdayDate(cell.date, true)}
              />
            )
          })}
        </MonthGrid>
      </div>
    </div>
  )
}

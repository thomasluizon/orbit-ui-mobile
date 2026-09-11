'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  buildCalendarMonthModel,
  buildDayCellAccessibleName,
  formatAPIDate,
  isCalendarDayLoggable,
  resolveDayCellOutcome,
  type CalendarMonthDay,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { DayCellProps, DayCellWords } from '@orbit/shared/contracts/dates'
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
  interaction?: 'write-window' | 'range-picker'
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
  interaction: 'write-window' | 'range-picker'
  todayKey: string
}

type CalendarFutureDayProps = {
  accessibleName: string
  cell: CalendarMonthDay
  selected: boolean
} & (
  | { interactive: true; onPress: () => void }
  | { interactive?: false; onPress?: never }
)

function CalendarFutureNumeral({ cell }: Readonly<Pick<CalendarFutureDayProps, 'cell'>>) {
  return (
    <span
      aria-hidden="true"
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

function CalendarFutureDay(props: Readonly<CalendarFutureDayProps>) {
  if (props.interactive) {
    return (
      <button
        type="button"
        aria-label={props.accessibleName}
        aria-pressed={props.selected}
        onClick={props.onPress}
        className="inline-flex size-11 items-center justify-center rounded-full border-0 bg-transparent p-0 cursor-pointer transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        <CalendarFutureNumeral cell={props.cell} />
      </button>
    )
  }
  return (
    <span role="img" aria-label={props.accessibleName} className="inline-flex size-11 items-center justify-center">
      <CalendarFutureNumeral cell={props.cell} />
    </span>
  )
}

function calendarDayBackground(selected: boolean, inRange: boolean, raised: boolean): string {
  if (selected || inRange) return 'var(--selection-bg)'
  return raised ? 'var(--bg-well)' : 'transparent'
}

function CalendarGridDayBody({
  accessibleName,
  cell,
  dayCell,
  future,
  interaction,
  isLoading,
  onSelectDay,
  selected,
}: Readonly<{
  accessibleName: string
  cell: CalendarMonthDay
  dayCell: DayCellProps
  future: boolean
  interaction: 'write-window' | 'range-picker'
  isLoading: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
}>) {
  if (isLoading) {
    return (
      <span
        aria-hidden="true"
        data-testid="calendar-day-skeleton"
        style={{ display: 'block', width: 44, height: 44, borderRadius: 999, background: 'var(--bg-well)', opacity: cell.isCurrentMonth ? 1 : 0 }}
      />
    )
  }
  if (future && cell.isCurrentMonth) {
    if (interaction === 'range-picker') {
      return <CalendarFutureDay accessibleName={accessibleName} cell={cell} selected={selected} interactive onPress={() => onSelectDay(cell.dateStr)} />
    }
    return <CalendarFutureDay accessibleName={accessibleName} cell={cell} selected={selected} />
  }
  return <DayCell {...dayCell} selected={selected} />
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
  interaction,
  todayKey,
}: Readonly<CalendarGridDayProps>) {
  const interactive = cell.isCurrentMonth && (
    interaction === 'range-picker' || isCalendarDayLoggable(cell.dateStr, todayKey)
  )
  const selectedLabel = selected ? `${label}, ${selectedWord}` : label
  const dayCellBase = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today: cell.isToday,
    outsideMonth: !cell.isCurrentMonth,
    label: selectedLabel,
    words,
  }
  const dayCell: DayCellProps = interactive
    ? { ...dayCellBase, loggable: true, onPress: () => onSelectDay(cell.dateStr) }
    : dayCellBase
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${selectedLabel}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome)
  const raised = interaction === 'write-window' && interactive

  return (
    <span
      data-calendar-date={cell.dateStr}
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
        background: calendarDayBackground(selected, inRange, raised),
        boxShadow: selected ? 'inset 0 0 0 2px var(--primary)' : 'none',
      }}
    >
      <CalendarGridDayBody
        accessibleName={accessibleName}
        cell={cell}
        dayCell={dayCell}
        future={future}
        interaction={interaction}
        isLoading={isLoading}
        onSelectDay={onSelectDay}
        selected={selected}
      />
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
  interaction = 'write-window',
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
                interaction={interaction}
                todayKey={todayKey}
              />
            )
          })}
        </MonthGrid>
      </div>
    </div>
  )
}

'use client'

import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  buildCalendarMonthModel,
  formatWeekdayLabels,
  buildDayCellAccessibleName,
  isCalendarDayLoggable,
  resolveDayCellOutcome,
  type CalendarMonthDay,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { DayCellWords, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
import { useDateFormat } from '@/hooks/use-date-format'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  selectedDateStr?: string | null
  rangeStart?: string | null
  rangeEnd?: string | null
  isLoading?: boolean
  weekStartsOn: 0 | 1
  todayKey: string
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
  onSelectDay: (dateStr: string) => void
  selected: boolean
  words: DayCellWords
  futureWord: string
  selectedWord: string
  label: string
  interaction: 'write-window' | 'range-picker'
  todayKey: string
  tabIndex: 0 | -1
  onKeyDown: (dateStr: string, event: KeyboardEvent<HTMLButtonElement>) => void
}

type CalendarFutureDayProps = {
  accessibleName: string
  cell: CalendarMonthDay
}

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
  onSelectDay,
  selected,
  today,
  tabIndex,
  onKeyDown,
}: Readonly<{
  accessibleName: string
  cell: CalendarMonthDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  today: boolean
  tabIndex: 0 | -1
  onKeyDown: CalendarGridDayProps['onKeyDown']
}>) {
  const contents = future && cell.isCurrentMonth
    ? <CalendarFutureDay accessibleName={accessibleName} cell={cell} />
    : <DayCell {...dayCell} />
  return (
    <>
      <span aria-hidden="true">{contents}</span>
      {cell.isCurrentMonth ? (
        <button
          type="button"
          tabIndex={tabIndex}
          onKeyDown={(event) => onKeyDown(cell.dateStr, event)}
          aria-current={today ? 'date' : undefined}
          aria-label={accessibleName}
          aria-pressed={selected}
          data-testid={`calendar-day-select-${cell.dateStr}`}
          onClick={() => onSelectDay(cell.dateStr)}
          className="absolute inset-0 rounded-full border-0 bg-transparent p-0 cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
      ) : null}
    </>
  )
}

function CalendarGridDay({
  cell,
  future,
  inRange,
  onSelectDay,
  selected,
  words,
  futureWord,
  selectedWord,
  label,
  interaction,
  todayKey,
  tabIndex,
  onKeyDown,
}: Readonly<CalendarGridDayProps>) {
  const writable = interaction === 'write-window'
    && cell.isCurrentMonth
    && isCalendarDayLoggable(cell.dateStr, todayKey)
  const today = cell.dateStr === todayKey
  const selectedLabel = selected ? `${label}, ${selectedWord}` : label
  const dayCellBase = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today,
    outsideMonth: !cell.isCurrentMonth,
    label: selectedLabel,
    words,
  }
  const dayCell: ReadOnlyDayCellProps = dayCellBase
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${selectedLabel}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome, !writable)
  const raised = writable

  return (
    <span
      data-calendar-date={cell.dateStr}
      data-in-range={inRange ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        minWidth: MONTH_GRID_TARGET_MIN,
        height: MONTH_GRID_TARGET_MIN,
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
        onSelectDay={onSelectDay}
        selected={selected}
        today={today}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
      />
    </span>
  )
}

function useMonthGridFocus(gridDays: CalendarMonthDay[], selectedDateStr: string | null, todayKey: string) {
  const monthDays = gridDays.filter((cell) => cell.isCurrentMonth)
  const firstDay = monthDays[0]!.dateStr
  const entryDate = monthDays.find((cell) => cell.dateStr === selectedDateStr)?.dateStr
    ?? monthDays.find((cell) => cell.dateStr === todayKey)?.dateStr
    ?? firstDay
  const selectionKey = `${firstDay}:${selectedDateStr}:${todayKey}`
  const [focus, setFocus] = useState({ selectionKey, dateStr: entryDate })
  if (focus.selectionKey !== selectionKey) {
    setFocus({ selectionKey, dateStr: entryDate })
  }
  const focusedDate = focus.selectionKey === selectionKey ? focus.dateStr : entryDate
  const moveTabStop = (dateStr: string) => setFocus({ selectionKey, dateStr })
  const onKeyDown = (dateStr: string, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const index = gridDays.findIndex((cell) => cell.dateStr === dateStr)
    let targetIndex: number
    switch (event.key) {
      case 'ArrowLeft': targetIndex = index - 1; break
      case 'ArrowRight': targetIndex = index + 1; break
      case 'ArrowUp': targetIndex = index - 7; break
      case 'ArrowDown': targetIndex = index + 7; break
      case 'Home': targetIndex = index - index % 7; break
      case 'End': targetIndex = index + 6 - index % 7; break
      default: return
    }
    event.preventDefault()
    const firstIndex = gridDays.findIndex((cell) => cell.isCurrentMonth)
    const lastIndex = firstIndex + monthDays.length - 1
    const targetDate = gridDays[Math.max(firstIndex, Math.min(lastIndex, targetIndex))]!.dateStr
    moveTabStop(targetDate)
    event.currentTarget.closest('[data-testid="month-grid-days"]')
      ?.querySelector<HTMLButtonElement>(`[data-testid="calendar-day-select-${targetDate}"]`)?.focus()
  }
  return { focusedDate, moveTabStop, onKeyDown }
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
  todayKey,
  interaction = 'write-window',
}: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayWeekdayDate, displayMonthYear } = useDateFormat()

  const weekdayLabels = useMemo(() => formatWeekdayLabels(locale, weekStartsOn), [locale, weekStartsOn])

  const { gridDays } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn, todayKey),
    [currentMonth, dayMap, weekStartsOn, todayKey],
  )

  const { focusedDate, moveTabStop, onKeyDown } = useMonthGridFocus(gridDays, selectedDateStr, todayKey)
  const selectDay = (dateStr: string) => {
    moveTabStop(dateStr)
    onSelectDay(dateStr)
  }

  const words: DayCellWords = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    readOnly: t('calendar.dayCell.readOnly'),
  }

  if (isLoading) {
    return (
      <div data-testid="calendar-grid" className="orbit-calendar-grid-frame" style={{ padding: '0 4px 8px' }}>
        <div data-testid="calendar-grid-card" className="orbit-calendar-grid-card">
          <div role="progressbar" aria-label={t('calendar.loading')} aria-busy="true" data-rows={Math.ceil(gridDays.length / 7)} data-cols={7}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(var(--month-grid-touch-min), 1fr))', gap: 'var(--calendar-grid-gap)', justifyItems: 'center' }}>
            {gridDays.map((cell) => <div key={cell.dateStr} style={{ width: MONTH_GRID_TARGET_MIN, minHeight: MONTH_GRID_TARGET_MIN }}><Skeleton variant="grid" rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} grouped /></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="calendar-grid"
      className="orbit-calendar-grid-frame" style={{ padding: '0 4px 8px' }}
    >
      <div
        data-testid="calendar-grid-card"
        className="orbit-calendar-grid-card"
      >
        <MonthGrid
          weekdayLabels={weekdayLabels}
          gap="var(--calendar-grid-gap)"
          label={displayMonthYear(currentMonth)}
        >
          {gridDays.map((cell) => {
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
                onSelectDay={selectDay}
                tabIndex={cell.dateStr === focusedDate ? 0 : -1}
                onKeyDown={onKeyDown}
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

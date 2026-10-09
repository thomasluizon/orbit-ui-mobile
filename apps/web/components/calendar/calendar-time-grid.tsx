'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { useTranslations } from 'next-intl'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { calendarEntryOutcome, formatCalendarWeekday, getAccountDateTime, nowDate, orderCalendarDayEntries } from '@orbit/shared/utils'

import { X } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { StatusRing } from '@/components/ui/status-ring'
import { CalendarEntryDetails } from './calendar-entry-details'

const HOUR_HEIGHT = 48
const BLOCK_HEIGHT = 72
const BLOCK_MIN_WIDTH = 48
const BLOCK_HORIZONTAL_INSET = 4
const MIN_LANE_WIDTH = 96
const HEADER_HEIGHT = 52
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const SCROLLER_VARIABLES = { '--time-grid-tail': '8rem' }

const CARD_BG = 'var(--bg-card)'
const pinnedPaneBackground = {
  backgroundColor: 'var(--bg-elev)',
} as const

export interface TimeGridColumn {
  date: Date
  dateStr: string
  isToday: boolean
  isFuture: boolean
}

interface CalendarTimeGridProps {
  columns: ReadonlyArray<TimeGridColumn>
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
  timeZone: string | null
  isLoading?: boolean
}

interface PlacedEntry {
  entry: CalendarDayEntry
  hour: number
  top: number
  lane: number
  laneCount: number
}

function parseMinutes(time: string | null): number | null {
  if (!time) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return Math.min(hours * 60 + minutes, 24 * 60 - 1)
}

/** Lays out timed entries into non-overlapping lanes so concurrent blocks sit
 *  side by side instead of stacking on top of each other. */
function layoutTimed(entries: CalendarDayEntry[]): PlacedEntry[] {
  const timed = entries
    .map((entry) => ({ entry, minutes: parseMinutes(entry.dueTime) }))
    .filter((item): item is { entry: CalendarDayEntry; minutes: number } => item.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes)

  const placed: PlacedEntry[] = []
  let cluster: { entry: CalendarDayEntry; minutes: number }[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    const laneEnds: number[] = []
    const local: PlacedEntry[] = []
    for (const item of cluster) {
      const top = (item.minutes / 60) * HOUR_HEIGHT
      let lane = laneEnds.findIndex((end) => end <= top)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = top + BLOCK_HEIGHT + 4
      local.push({ entry: item.entry, hour: Math.floor(item.minutes / 60), top, lane, laneCount: 0 })
    }
    for (const block of local) {
      block.laneCount = laneEnds.length
      placed.push(block)
    }
  }

  for (const item of timed) {
    const top = (item.minutes / 60) * HOUR_HEIGHT
    if (cluster.length > 0 && top >= clusterEnd) {
      flush()
      cluster = []
      clusterEnd = -Infinity
    }
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, top + BLOCK_HEIGHT + 4)
  }
  if (cluster.length > 0) flush()

  return placed
}

function TimedBlock({
  block,
  displayTime,
  onSelect,
  isFuture,
}: Readonly<{
  block: PlacedEntry
  displayTime: (time: string) => string
  onSelect: () => void
  isFuture: boolean
}>) {
  const t = useTranslations()
  const outcome = calendarEntryOutcome(block.entry)
  return (
    <button
      type="button"
      data-testid="time-grid-event"
      data-hour={block.hour}
      onClick={onSelect}
      aria-label={t('calendar.entryLabel', { title: block.entry.title, time: displayTime(block.entry.dueTime!), status: t(outcome.labelKey) })}
      className={`group absolute flex flex-col items-start justify-between gap-1 overflow-hidden text-left cursor-pointer hover:bg-[var(--bg-hover-opaque)] active:bg-[var(--bg-hover-opaque)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96] ${isFuture ? 'bg-transparent' : 'bg-[var(--bg-well)]'}`}
      style={{
        top: `${block.top / 16}rem`,
        minHeight: 48,
        height: '4.5rem',
        left: `calc(${(block.lane / block.laneCount) * 100}% + ${BLOCK_HORIZONTAL_INSET / 2}px)`,
        width: `calc(${100 / block.laneCount}% - ${BLOCK_HORIZONTAL_INSET}px)`,
        minWidth: BLOCK_MIN_WIDTH,
        padding: 4,
        borderRadius: 8,
        border: 0,
        appearance: 'none',
        boxShadow: `inset 0 0 0 1px var(${isFuture ? '--hairline-ghost' : '--hairline'})`,
      }}
    >
      <PersonalText data-testid="time-grid-event-name" style={{ width: '100%', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--fg-1)' }}>{block.entry.title}</PersonalText>
      <span className="flex w-full min-w-0 items-center gap-1">
      <span aria-hidden="true" className="relative inline-flex shrink-0">
        <StatusRing status={outcome.status} size={24} label={t(outcome.labelKey)} />
        {outcome.status === 'bad' ? <span className="absolute inset-0 flex items-center justify-center"><X size={16} color="var(--status-bad)" strokeWidth={1.5} /></span> : null}
      </span>
      <span className="truncate text-[var(--fg-3)] group-hover:text-[var(--fg-2)] group-active:text-[var(--fg-2)]" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.4 }}>{displayTime(block.entry.dueTime!)}</span>
      </span>
    </button>
  )
}

function AllDayChip({ label, accessibilityLabel, onSelect, more = false }: Readonly<{ label: string; accessibilityLabel: string; onSelect: () => void; more?: boolean }>) {
  return <button type="button" data-testid={more ? 'time-grid-all-day-more' : 'time-grid-all-day-event'} onClick={onSelect} aria-label={accessibilityLabel}
    className="flex min-w-0 items-center bg-transparent cursor-pointer rounded-[8px] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
    style={{ minHeight: 48, height: '2.8rem', minWidth: 48, padding: 0, border: 0 }}>
    <span className="flex w-full min-w-0 items-center" style={{ height: '1.75rem', paddingInline: 8, borderRadius: 8, background: 'var(--bg-well)', boxShadow: 'inset 0 0 0 1px var(--hairline)', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--fg-2)' }}>
      <span className="truncate">{label}</span>
    </span>
  </button>
}

/** Google-Calendar-style time grid: a day column per entry in `columns`, an
 *  untimed all-day band on top, and timed habits placed as blocks by dueTime.
 *  Day columns keep a readable minimum width and scroll horizontally, with the
 *  time gutter and the header/all-day rows pinned, so labels never
 *  compress. Shared by the week view (7 columns) and custom-range view (N). */
export function CalendarTimeGrid({
  columns,
  dayMap,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
  timeZone,
  isLoading = false,
}: Readonly<CalendarTimeGridProps>) {
  const t = useTranslations()
  const [disclosure, setDisclosure] = useState<{ entries: CalendarDayEntry[]; title: string } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [isPanePinned, setIsPanePinned] = useState(true)
  const [now, setNow] = useState<Date>(() => nowDate())
  const nowMinutes = getAccountDateTime(now, timeZone).minutes

  useEffect(() => {
    const interval = setInterval(() => setNow(nowDate()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const perColumn = useMemo(
    () =>
      columns.map((column) => {
        const entries = orderCalendarDayEntries(dayMap.get(column.dateStr) ?? [])
        return {
          column,
          allDay: entries.filter((entry) => !entry.dueTime),
          timed: layoutTimed(entries),
        }
      }),
    [columns, dayMap],
  )

  const maxLaneCount = Math.max(
    1,
    ...perColumn.flatMap(({ timed }) => timed.map(({ laneCount }) => laneCount)),
  )
  const minColumnWidth = Math.max(96, maxLaneCount * MIN_LANE_WIDTH)
  const longestHourLabel = Math.max(...HOURS.map((hour) => displayTime(`${String(hour).padStart(2, '0')}:00`).length))
  const gutterWidth = `max(96px, calc(${longestHourLabel}ch + 16px))`
  const columnMinWidth = `${minColumnWidth / 16}rem`
  const columnTrack = `minmax(${columnMinWidth}, 1fr)`
  const gridTemplate = `${gutterWidth} repeat(${columns.length}, ${columnTrack})`
  const gridMinWidth = `calc(${gutterWidth} + ${columns.length} * ${columnMinWidth})`

  const openingPosition = useRef(false)
  useEffect(() => {
    const node = bodyRef.current
    if (!node) return
    const open = () => {
      const paneHeight = node.firstElementChild?.clientHeight ?? 0
      const shouldPin = paneHeight <= node.clientHeight / 2
      setIsPanePinned(shouldPin)
      const pinnedHeight = shouldPin ? paneHeight : 0
      const hourLabels = node.querySelectorAll<HTMLElement>('[data-testid="time-grid-hour-label"]')
      const measuredHour = hourLabels[1]!.offsetTop - hourLabels[0]!.offsetTop
      const scale = measuredHour > 0 ? measuredHour / HOUR_HEIGHT : 1
      const bodyHeight = Math.max(0, node.clientHeight - pinnedHeight)
      node.style.setProperty('--time-grid-tail', `${Math.max(128 * scale, bodyHeight * 0.75)}px`)
      node.style.scrollPaddingTop = `${pinnedHeight}px`
      if (openingPosition.current || isLoading || bodyHeight <= 0) return
      const firstTop = Math.min(7 * HOUR_HEIGHT, ...perColumn.flatMap(({ timed }) => timed.map(({ top }) => top)))
      node.scrollTop = Math.max(0, columns.some(({ isToday }) => isToday)
        ? (getAccountDateTime(nowDate(), timeZone).minutes / 60) * HOUR_HEIGHT * scale - bodyHeight / 4
        : firstTop * scale) + (shouldPin ? 0 : paneHeight)
      const todayColumn = node.querySelector<HTMLElement>('[data-today="true"]')
      if (todayColumn) {
        const gutter = node.querySelector<HTMLElement>('[data-testid="time-grid-any-time-label"]')?.parentElement?.clientWidth ?? 0
        node.scrollLeft = Math.max(0, todayColumn.offsetLeft - gutter - (node.clientWidth - gutter - todayColumn.clientWidth) / 2)
      }
      openingPosition.current = node.clientHeight > 0 && !isLoading
    }
    const preserveOpeningPosition = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) openingPosition.current = true
    }
    node.addEventListener('keydown', preserveOpeningPosition)
    open()
    const observer = new ResizeObserver(open)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    return () => {
      observer.disconnect()
      node.removeEventListener('keydown', preserveOpeningPosition)
    }
  }, [columns, perColumn, timeZone, isLoading])

  const isEmpty =
    !isLoading &&
    perColumn.every(({ allDay, timed }) => allDay.length === 0 && timed.length === 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ padding: '0 16px 16px' }}>
      <div
        data-testid="calendar-time-grid"
        data-focus-inset="grid"
        data-columns={columns.length}
        className="relative flex min-h-0 flex-1 flex-col"
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          background: CARD_BG,
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div
          ref={bodyRef}
          onWheel={() => { openingPosition.current = true }}
          onTouchMove={() => { openingPosition.current = true }}
          onScroll={(event) => {
            if (event.currentTarget.scrollLeft > 0 || event.currentTarget.scrollTop > 0) openingPosition.current = true
          }}
          data-testid="time-grid-hour-scroller"
          data-time-grid-scroller=""
          style={{ ...SCROLLER_VARIABLES, scrollPaddingLeft: gutterWidth, overflow: 'auto', overscrollBehavior: 'contain', flex: 1, minHeight: 0, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
        >
          <div data-testid="time-grid-day-pane" data-pinning={isPanePinned ? 'pinned' : 'scrolling'} className={`${isPanePinned ? 'sticky top-0' : 'relative'} z-[3]`} style={{ minWidth: gridMinWidth, ...pinnedPaneBackground }}>
            <div
              className="grid"
              style={{ gridTemplateColumns: gridTemplate, minWidth: gridMinWidth, ...pinnedPaneBackground }}
            >
              <div
                aria-hidden="true"
                className="sticky left-0 z-[1]"
                style={{ minHeight: HEADER_HEIGHT, borderBottom: '1px solid var(--hairline)', ...pinnedPaneBackground }}
              />
              {perColumn.map(({ column }) => (
                <button
                  key={column.dateStr}
                  type="button"
                  data-testid="time-grid-col-header"
                  data-focus-inset="panel"
                  onClick={() => onSelectDay(column.dateStr)}
                  className="flex flex-col items-center justify-center bg-transparent transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover-opaque)] active:bg-[var(--bg-hover-opaque)] active:scale-[0.96]"
                  style={{
                    appearance: 'none',
                    border: 0,
                    minHeight: HEADER_HEIGHT,
                    borderLeft: '1px solid var(--hairline)',
                    borderBottom: '1px solid var(--hairline)',
                    cursor: 'pointer',
                    padding: '8px 4px',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: 'var(--fg-2)',
                    }}
                  >
                    {formatCalendarWeekday(column.dateStr, dateFnsLocale.code)}
                  </span>
                  <span
                    data-testid="time-grid-col-date"
                    className="inline-flex items-center justify-center rounded-full"
                    style={{
                      minWidth: '1.5rem',
                      minHeight: '1.5rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                      color: column.isToday
                        ? 'var(--fg-on-primary)'
                        : column.isFuture
                          ? 'var(--fg-2)'
                          : 'var(--fg-1)',
                      background: column.isToday ? 'var(--primary)' : 'transparent',
                    }}
                  >
                    {format(column.date, 'd', { locale: dateFnsLocale })}
                  </span>
                </button>
              ))}
            </div>

            <div
              data-testid="time-grid-all-day-band"
              className="grid"
              style={{
                gridTemplateColumns: gridTemplate,
                minWidth: gridMinWidth,
                ...pinnedPaneBackground,
              }}
            >
              <div
                className="sticky left-0 z-[1] flex items-start justify-end"
                style={{
                  padding: '8px 8px 0',
                  borderBottom: '1px solid var(--hairline)',
                  ...pinnedPaneBackground,
                }}
              >
                <span data-testid="time-grid-any-time-label" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--fg-2)' }}>{allDayLabel}</span>
              </div>
              {perColumn.map(({ column, allDay }) => {
                return (
                  <div
                    key={column.dateStr}
                    data-testid="time-grid-all-day"
                    data-date={column.dateStr}
                    className="flex min-w-0 flex-col"
                    style={{
                      gap: 4,
                      minHeight: 64,
                      padding: '8px 4px',
                      borderLeft: `1px solid var(${column.isFuture ? '--hairline-ghost' : '--hairline'})`,
                      borderBottom: `1px solid var(${column.isFuture ? '--hairline-ghost' : '--hairline'})`,
                    }}
                  >
                    {(allDay.length >= 3 ? allDay.slice(0, 1) : allDay).map((entry) => <AllDayChip key={entry.habitId} label={entry.title} accessibilityLabel={entry.title} onSelect={() => setDisclosure({ entries: [entry], title: t('calendar.entryDetails') })} />)}
                    {allDay.length >= 3 ? <AllDayChip more label={t('calendar.timeGrid.moreCount', { count: allDay.length - 1 })} accessibilityLabel={t('calendar.timeGrid.moreCountLabel', { count: allDay.length - 1 })} onSelect={() => onSelectDay(column.dateStr)} /> : null}
                  </div>
                )
              })}
            </div>

          </div>
          <div className="grid" style={{ gridTemplateColumns: gridTemplate, minWidth: gridMinWidth }}>
            <div
              aria-hidden="true"
              className="sticky left-0 z-[1]"
              style={{ minHeight: '80rem', height: 'calc(72rem + var(--time-grid-tail, 128px))', ...pinnedPaneBackground }}
            >
              {HOURS.map((hour) => (
                <span
                  key={hour}
                  data-testid="time-grid-hour-label"
                  className="absolute right-2"
                  style={{
                    top: `calc(${hour * 3}rem + 2px)`,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--fg-2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {displayTime(`${String(hour).padStart(2, '0')}:00`)}
                </span>
              ))}
            </div>
            {perColumn.map(({ column, timed }) => (
              <div
                key={column.dateStr}
                data-testid="time-grid-day-column"
                data-today={column.isToday}
                data-date={column.dateStr}
                style={{
                  position: 'relative',
                  height: 'calc(72rem + var(--time-grid-tail, 128px))',
                  minHeight: '80rem',
                  borderLeft: `1px solid var(${column.isFuture ? '--hairline-ghost' : '--hairline'})`,
                }}
              >
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    aria-hidden="true"
                    className="absolute inset-x-0"
                    style={{
                      top: `${hour * 3}rem`,
                      height: 1,
                      background: `var(${column.isFuture ? '--hairline-ghost' : '--hairline'})`,
                    }}
                  />
                ))}
                {timed.map((block) => (
                  <TimedBlock
                    key={block.entry.habitId}
                    block={block}
                    displayTime={displayTime}
                    onSelect={() => setDisclosure({ entries: [block.entry], title: t('calendar.entryDetails') })}
                    isFuture={column.isFuture}
                  />
                ))}
                {column.isToday && (
                  <div
                    className="absolute left-0 right-0 flex items-center"
                    style={{ top: `${nowMinutes / 20}rem`, pointerEvents: 'none' }}
                    role="img"
                    aria-label={nowLabel}
                  >
                    <span
                      className="shrink-0 rounded-full"
                      style={{ width: 7, height: 7, marginLeft: -4, background: 'var(--primary)' }}
                    />
                    <span style={{ height: 1.5, flex: 1, background: 'var(--primary)' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {isEmpty && (
          <div
            data-testid="time-grid-empty"
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: 'none', padding: 24 }}
          >
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.875rem', color: 'var(--fg-2)' }}>
              {t('calendar.timeGrid.empty')}
            </span>
          </div>
        )}
      </div>
      {disclosure ? <CalendarEntryDetails entries={disclosure.entries} title={disclosure.title} displayTime={displayTime} onClose={() => setDisclosure(null)} /> : null}
    </div>
  )
}

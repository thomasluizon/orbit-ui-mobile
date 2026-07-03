'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, getHours, getMinutes } from 'date-fns'
import type { Locale } from 'date-fns'
import { useTranslations } from 'next-intl'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useIsDesktop } from '@/hooks/use-is-desktop'

const HOUR_HEIGHT = 48
const DAY_HEIGHT = HOUR_HEIGHT * 24
const BLOCK_HEIGHT = 38
const GUTTER = 56
const MIN_COL_WIDTH = 80
const HEADER_HEIGHT = 52
const BODY_MAX_HEIGHT = 520
const SCROLLER_MAX_HEIGHT = HEADER_HEIGHT + 40 + BODY_MAX_HEIGHT
const ALL_DAY_MAX_VISIBLE = 5
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Caps the all-day stack so a heavy day cannot push the timed grid off-screen:
 *  the first chips show, the rest collapse into a single tappable "+N". */
function splitAllDay(allDay: CalendarDayEntry[]): {
  visible: CalendarDayEntry[]
  overflow: number
} {
  if (allDay.length <= ALL_DAY_MAX_VISIBLE) return { visible: allDay, overflow: 0 }
  return {
    visible: allDay.slice(0, ALL_DAY_MAX_VISIBLE - 1),
    overflow: allDay.length - (ALL_DAY_MAX_VISIBLE - 1),
  }
}

const CARD_BG = 'var(--bg-card)'
const pinnedPaneBackground = {
  backgroundColor: 'var(--bg)',
  backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))',
} as const

export interface TimeGridColumn {
  date: Date
  dateStr: string
  isToday: boolean
}

interface CalendarTimeGridProps {
  columns: ReadonlyArray<TimeGridColumn>
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
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

function currentMinutesOfDay(): number {
  const now = new Date()
  return getHours(now) * 60 + getMinutes(now)
}

function entryAccent(entry: CalendarDayEntry): string {
  if (entry.status === 'completed') {
    return entry.isBadHabit ? 'var(--status-bad)' : 'var(--status-done)'
  }
  if (entry.status === 'missed') {
    return entry.isBadHabit ? 'var(--status-done)' : 'var(--status-overdue)'
  }
  return 'var(--fg-4)'
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
      laneEnds[lane] = top + BLOCK_HEIGHT
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
    clusterEnd = Math.max(clusterEnd, top + BLOCK_HEIGHT)
  }
  if (cluster.length > 0) flush()

  return placed
}

function TimedBlock({
  block,
  displayTime,
  onSelect,
}: Readonly<{
  block: PlacedEntry
  displayTime: (time: string) => string
  onSelect: () => void
}>) {
  const accent = entryAccent(block.entry)
  const completed = block.entry.status === 'completed'
  return (
    <button
      type="button"
      data-testid="time-grid-event"
      data-hour={block.hour}
      onClick={onSelect}
      className="absolute flex flex-col justify-center overflow-hidden text-left cursor-pointer bg-[color-mix(in_srgb,var(--tg-accent)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--tg-accent)_24%,transparent)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.98]"
      style={{
        top: block.top,
        height: BLOCK_HEIGHT,
        left: `calc(${(block.lane / block.laneCount) * 100}% + 2px)`,
        width: `calc(${100 / block.laneCount}% - 4px)`,
        padding: '4px 6px',
        borderRadius: 8,
        border: 0,
        appearance: 'none',
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 42%, transparent)`,
        '--tg-accent': accent,
      } as React.CSSProperties}
    >
      <span
        className="truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.2,
          color: completed ? 'var(--fg-3)' : 'var(--fg-1)',
          textDecoration: completed ? 'line-through' : 'none',
        }}
      >
        {block.entry.title}
      </span>
      {block.entry.dueTime && (
        <span
          className="truncate"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayTime(block.entry.dueTime)}
        </span>
      )}
    </button>
  )
}

function AllDayChip({ entry }: Readonly<{ entry: CalendarDayEntry }>) {
  const accent = entryAccent(entry)
  const completed = entry.status === 'completed'
  return (
    <div
      data-testid="time-grid-all-day-event"
      className="flex items-center gap-1 overflow-hidden"
      style={{
        padding: '3px 6px',
        borderRadius: 8,
        background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 28%, transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full"
        style={{ width: 5, height: 5, background: accent }}
      />
      <span
        className="truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fontWeight: 500,
          color: completed ? 'var(--fg-3)' : 'var(--fg-1)',
          textDecoration: completed ? 'line-through' : 'none',
        }}
      >
        {entry.title}
      </span>
    </div>
  )
}

function AllDayMoreChip({
  count,
  accessibilityLabel,
  onSelect,
}: Readonly<{ count: number; accessibilityLabel: string; onSelect: () => void }>) {
  return (
    <button
      type="button"
      data-testid="time-grid-all-day-more"
      onClick={onSelect}
      aria-label={accessibilityLabel}
      className="touch-target-y flex items-center justify-center bg-transparent transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
      style={{
        appearance: 'none',
        cursor: 'pointer',
        padding: '3px 6px',
        borderRadius: 8,
        border: 0,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        +{count}
      </span>
    </button>
  )
}

/** Google-Calendar-style time grid: a day column per entry in `columns`, an
 *  untimed all-day band on top, and timed habits placed as blocks by dueTime.
 *  Day columns keep a readable minimum width and scroll horizontally — the left
 *  time gutter and the header/all-day rows stay pinned — so labels never
 *  compress. Shared by the week view (7 columns) and custom-range view (N). */
export function CalendarTimeGrid({
  columns,
  dayMap,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
  isLoading = false,
}: Readonly<CalendarTimeGridProps>) {
  const t = useTranslations()
  const bodyRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()
  const [nowMinutes, setNowMinutes] = useState(currentMinutesOfDay)

  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(currentMinutesOfDay()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const node = bodyRef.current
    if (node) node.scrollTop = 7 * HOUR_HEIGHT
  }, [])

  const columnTrack = isDesktop ? '1fr' : `minmax(${MIN_COL_WIDTH}px, 1fr)`
  const gridTemplate = `${GUTTER}px repeat(${columns.length}, ${columnTrack})`
  const gridMinWidth = isDesktop ? undefined : GUTTER + columns.length * MIN_COL_WIDTH
  const scrollerOverflow = isDesktop ? { overflowX: 'hidden', overflowY: 'auto' } as const : { overflow: 'auto' } as const

  const perColumn = useMemo(
    () =>
      columns.map((column) => {
        const entries = dayMap.get(column.dateStr) ?? []
        return {
          column,
          allDay: entries.filter((entry) => !entry.dueTime),
          timed: layoutTimed(entries),
        }
      }),
    [columns, dayMap],
  )

  const isEmpty =
    !isLoading &&
    perColumn.every(({ allDay, timed }) => allDay.length === 0 && timed.length === 0)

  return (
    <div style={{ padding: '4px 20px 16px' }}>
      <div
        data-testid="calendar-time-grid"
        data-columns={columns.length}
        className="relative"
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          background: CARD_BG,
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div
          ref={bodyRef}
          className="thin-scrollbar"
          style={{ ...scrollerOverflow, maxHeight: SCROLLER_MAX_HEIGHT }}
        >
          <div
            className="grid sticky top-0 z-[3]"
            style={{ gridTemplateColumns: gridTemplate, minWidth: gridMinWidth, ...pinnedPaneBackground }}
          >
            <div
              aria-hidden="true"
              className="sticky left-0 z-[1]"
              style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--hairline)', ...pinnedPaneBackground }}
            />
            {perColumn.map(({ column }) => (
              <button
                key={column.dateStr}
                type="button"
                data-testid="time-grid-col-header"
                onClick={() => onSelectDay(column.dateStr)}
                className="flex flex-col items-center justify-center bg-transparent transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
                style={{
                  appearance: 'none',
                  border: 0,
                  height: HEADER_HEIGHT,
                  borderLeft: '1px solid var(--hairline)',
                  borderBottom: '1px solid var(--hairline)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  gap: 2,
                }}
              >
                <span
                  className="uppercase"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    color: column.isToday ? 'var(--primary)' : 'var(--fg-3)',
                  }}
                >
                  {format(column.date, 'EEE', { locale: dateFnsLocale })}
                </span>
                <span
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    fontWeight: column.isToday ? 700 : 500,
                    fontVariantNumeric: 'tabular-nums',
                    color: column.isToday ? 'var(--fg-on-primary)' : 'var(--fg-1)',
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
            className="grid sticky z-[2]"
            style={{
              gridTemplateColumns: gridTemplate,
              minWidth: gridMinWidth,
              top: HEADER_HEIGHT,
              ...pinnedPaneBackground,
            }}
          >
            <div
              className="sticky left-0 z-[1] flex items-start justify-end"
              style={{
                padding: '6px 6px 0',
                borderBottom: '1px solid var(--hairline)',
                ...pinnedPaneBackground,
              }}
            >
              <span
                className="uppercase"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  color: 'var(--fg-4)',
                }}
              >
                {allDayLabel}
              </span>
            </div>
            {perColumn.map(({ column, allDay }) => {
              const { visible, overflow } = splitAllDay(allDay)
              return (
                <div
                  key={column.dateStr}
                  data-testid="time-grid-all-day"
                  data-date={column.dateStr}
                  className="flex flex-col"
                  style={{
                    gap: 3,
                    minHeight: 34,
                    padding: '6px 3px',
                    borderLeft: '1px solid var(--hairline)',
                    borderBottom: '1px solid var(--hairline)',
                  }}
                >
                  {visible.map((entry) => (
                    <AllDayChip key={entry.habitId} entry={entry} />
                  ))}
                  {overflow > 0 && (
                    <AllDayMoreChip
                      count={overflow}
                      accessibilityLabel={t('calendar.timeGrid.moreLabel', { count: overflow })}
                      onSelect={() => onSelectDay(column.dateStr)}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid" style={{ gridTemplateColumns: gridTemplate, minWidth: gridMinWidth }}>
            <div
              aria-hidden="true"
              className="sticky left-0 z-[1]"
              style={{ height: DAY_HEIGHT, ...pinnedPaneBackground }}
            >
              {HOURS.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-2"
                  style={{
                    top: hour * HOUR_HEIGHT + 2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--fg-4)',
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
                style={{
                  position: 'relative',
                  height: DAY_HEIGHT,
                  borderLeft: '1px solid var(--hairline)',
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, var(--hairline) 0, var(--hairline) 1px, transparent 1px, transparent ' +
                    HOUR_HEIGHT +
                    'px)',
                }}
              >
                {timed.map((block) => (
                  <TimedBlock
                    key={block.entry.habitId}
                    block={block}
                    displayTime={displayTime}
                    onSelect={() => onSelectDay(column.dateStr)}
                  />
                ))}
                {column.isToday && (
                  <div
                    className="absolute left-0 right-0 flex items-center"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT, pointerEvents: 'none' }}
                    aria-label={nowLabel}
                  >
                    <span
                      className="shrink-0 rounded-full"
                      style={{ width: 7, height: 7, marginLeft: -3, background: 'var(--primary)' }}
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
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
              {t('calendar.timeGrid.empty')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

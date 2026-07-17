'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  subDays,
  isToday,
  getHours,
  getMinutes,
  format,
} from 'date-fns'
import type { Locale } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate, capitalizeFirstLetter } from '@orbit/shared/utils'
import type {
  CalendarMonthResponse,
  HabitScheduleItem,
  UpdateHabitRequest,
} from '@orbit/shared/types/habit'
import { useUpdateHabit } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import { CalendarLoadError } from './calendar-load-error'
import { ShowRecurringToggle } from './show-recurring-toggle'
import { useAgendaDay, type AgendaEntry } from './use-agenda-day'

const HOUR_HEIGHT = 56
const DAY_HEIGHT = HOUR_HEIGHT * 24
const GUTTER = 64
const DEFAULT_EVENT_MINUTES = 60
const SNAP_MINUTES = 15
const MIN_BLOCK_HEIGHT = 30
const SCROLL_TO_HOUR = 7
const MINUTES_IN_DAY = 24 * 60
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

const pinnedPaneBackground = {
  backgroundColor: 'var(--bg)',
} as const

function currentMinutes(): number {
  const now = new Date()
  return getHours(now) * 60 + getMinutes(now)
}

interface PlacedBlock {
  entry: AgendaEntry
  startMinutes: number
  top: number
  height: number
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
  return Math.min(hours * 60 + minutes, MINUTES_IN_DAY - 1)
}

function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(total, MINUTES_IN_DAY - SNAP_MINUTES))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function entryAccent(entry: AgendaEntry): string {
  if (entry.status === 'completed') {
    return entry.isBadHabit ? 'var(--status-bad)' : 'var(--status-done)'
  }
  if (entry.status === 'missed') {
    return entry.isBadHabit ? 'var(--status-done)' : 'var(--status-overdue)'
  }
  return 'var(--primary)'
}

function eventEndMinutes(entry: AgendaEntry, start: number): number {
  const end = parseMinutes(entry.dueEndTime)
  if (end !== null && end > start) return Math.min(end, MINUTES_IN_DAY)
  return Math.min(start + DEFAULT_EVENT_MINUTES, MINUTES_IN_DAY)
}

function layoutAgenda(entries: AgendaEntry[]): PlacedBlock[] {
  const timed = entries
    .map((entry) => ({ entry, start: parseMinutes(entry.dueTime) }))
    .filter((item): item is { entry: AgendaEntry; start: number } => item.start !== null)
    .sort((a, b) => a.start - b.start)

  const placed: PlacedBlock[] = []
  let cluster: { entry: AgendaEntry; start: number; end: number }[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    const laneEnds: number[] = []
    const local: PlacedBlock[] = []
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = item.end
      local.push({
        entry: item.entry,
        startMinutes: item.start,
        top: (item.start / 60) * HOUR_HEIGHT,
        height: Math.max(MIN_BLOCK_HEIGHT, ((item.end - item.start) / 60) * HOUR_HEIGHT),
        lane,
        laneCount: 0,
      })
    }
    for (const block of local) {
      block.laneCount = laneEnds.length
      placed.push(block)
    }
  }

  for (const item of timed) {
    const end = eventEndMinutes(item.entry, item.start)
    if (cluster.length > 0 && item.start >= clusterEnd) {
      flush()
      cluster = []
      clusterEnd = -Infinity
    }
    cluster.push({ entry: item.entry, start: item.start, end })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length > 0) flush()

  return placed
}

function shiftedEndTime(habit: HabitScheduleItem, newStartMinutes: number): string | null {
  const oldStart = parseMinutes(habit.dueTime)
  const oldEnd = parseMinutes(habit.dueEndTime)
  if (oldStart === null || oldEnd === null || oldEnd <= oldStart) return habit.dueEndTime
  return minutesToTime(Math.min(newStartMinutes + (oldEnd - oldStart), MINUTES_IN_DAY - SNAP_MINUTES))
}

function buildTimeRescheduleRequest(
  habit: HabitScheduleItem,
  dueTime: string,
  dueEndTime: string | null,
): UpdateHabitRequest {
  const request: UpdateHabitRequest = {
    title: habit.title,
    isBadHabit: habit.isBadHabit,
    isGeneral: habit.isGeneral,
    isFlexible: habit.isFlexible,
    dueTime,
  }
  if (habit.description) request.description = habit.description
  if (habit.emoji) request.emoji = habit.emoji
  if (habit.frequencyUnit) {
    request.frequencyUnit = habit.frequencyUnit
    request.frequencyQuantity = habit.frequencyQuantity ?? 1
  }
  if (habit.days.length > 0) request.days = habit.days
  if (dueEndTime) request.dueEndTime = dueEndTime
  return request
}

function patchHabitTime(
  data: CalendarMonthResponse,
  habitId: string,
  dueTime: string,
  dueEndTime: string | null,
): CalendarMonthResponse {
  return {
    ...data,
    habits: data.habits.map((habit) =>
      habit.id === habitId ? { ...habit, dueTime, dueEndTime } : habit,
    ),
  }
}

interface AgendaEventBlockProps {
  block: PlacedBlock
  displayTime: (time: string) => string
}

function AgendaEventBlock({ block, displayTime }: Readonly<AgendaEventBlockProps>) {
  const { entry } = block
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.habitId,
    data: { minutes: block.startMinutes },
  })
  const [isHovered, setIsHovered] = useState(false)
  const accent = entryAccent(entry)
  const completed = entry.status === 'completed'
  const endLabel = entry.dueEndTime ? ` - ${displayTime(entry.dueEndTime)}` : ''

  const accentRing = `inset 0 0 0 1px color-mix(in srgb, ${accent} 42%, transparent)`

  let boxShadow: string
  if (isDragging) {
    boxShadow = `${accentRing}, var(--shadow-2)`
  } else if (isHovered) {
    boxShadow = `${accentRing}, var(--shadow-1)`
  } else {
    boxShadow = accentRing
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    top: block.top,
    height: block.height,
    left: `calc(${(block.lane / block.laneCount) * 100}% + 2px)`,
    width: `calc(${100 / block.laneCount}% - 4px)`,
    transform: CSS.Translate.toString(transform) ?? undefined,
    zIndex: isDragging ? 5 : 1,
    opacity: isDragging ? 0.9 : 1,
    touchAction: 'none',
    cursor: isDragging ? 'grabbing' : 'grab',
    padding: '6px 8px',
    borderRadius: 8,
    overflow: 'hidden',
    background: `color-mix(in srgb, ${accent} 16%, transparent)`,
    boxShadow,
    transition: isDragging
      ? undefined
      : 'box-shadow var(--dur-fast) var(--ease-standard)',
  }

  return (
    <div
      ref={setNodeRef}
      data-testid="agenda-event"
      data-habit-id={entry.habitId}
      data-due-time={entry.dueTime ?? ''}
      style={style}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      {...attributes}
      {...listeners}
    >
      <span
        className="block truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.25,
          color: completed ? 'var(--fg-3)' : 'var(--fg-1)',
          textDecoration: completed ? 'line-through' : 'none',
        }}
      >
        {entry.title}
      </span>
      {entry.dueTime && (
        <span
          className="block truncate"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayTime(entry.dueTime)}
          {endLabel}
        </span>
      )}
    </div>
  )
}

interface AgendaAllDayChipProps {
  entry: AgendaEntry
}

function AgendaAllDayChip({ entry }: Readonly<AgendaAllDayChipProps>) {
  const accent = entryAccent(entry)
  const completed = entry.status === 'completed'
  return (
    <div
      data-testid="agenda-all-day-event"
      className="flex items-center gap-1.5 overflow-hidden"
      style={{
        padding: '4px 8px',
        borderRadius: 8,
        background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 28%, transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full"
        style={{ width: 6, height: 6, background: accent }}
      />
      <span
        className="truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
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

interface AgendaDayNavProps {
  label: string
  previousLabel: string
  nextLabel: string
  todayLabel: string
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}

function AgendaDayNav({
  label,
  previousLabel,
  nextLabel,
  todayLabel,
  onPrevious,
  onNext,
  onToday,
}: Readonly<AgendaDayNavProps>) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '0 4px' }}>
      <button
        type="button"
        aria-label={previousLabel}
        onClick={onPrevious}
        className="icon-btn touch-target shrink-0"
      >
        <ChevronLeft size={22} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={todayLabel}
        onClick={onToday}
        className="touch-target appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
        style={{
          height: 40,
          padding: '0 16px',
          fontFamily: 'var(--font-sans)',
          fontSize: 17,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
        }}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        onClick={onNext}
        className="icon-btn touch-target shrink-0"
      >
        <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      </button>
    </div>
  )
}

interface CalendarAgendaViewProps {
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
}

/** Desktop day-planner: a single-day hourly timeline that places each timed
 *  habit by its due time and lets the user drag a block to a new time. The drop
 *  persists the new `dueTime` through the shared habit-update mutation with an
 *  optimistic cache patch, a success toast, and rollback on failure. */
export function CalendarAgendaView({
  displayTime,
  dateFnsLocale,
  showRecurring,
  onShowRecurringChange,
}: Readonly<CalendarAgendaViewProps>) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const updateHabit = useUpdateHabit()
  const { showSuccess, showError } = useAppToast()

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const dateStr = formatAPIDate(selectedDate)
  const { entries, habitsById, isLoading, error, refresh } = useAgendaDay(selectedDate, true)

  const bodyRef = useRef<HTMLDivElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    const node = bodyRef.current
    if (node) node.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT
  }, [])

  const visibleEntries = useMemo(
    () => (showRecurring ? entries : entries.filter((entry) => entry.isOneTime)),
    [entries, showRecurring],
  )
  const timedBlocks = useMemo(() => layoutAgenda(visibleEntries), [visibleEntries])
  const allDayEntries = useMemo(
    () => visibleEntries.filter((entry) => !entry.dueTime),
    [visibleEntries],
  )

  const dayLabel = useMemo(
    () => capitalizeFirstLetter(format(selectedDate, 'EEEE, MMM d', { locale: dateFnsLocale })),
    [selectedDate, dateFnsLocale],
  )
  const [nowMinutes, setNowMinutes] = useState(currentMinutes)

  useEffect(() => {
    const intervalId = setInterval(() => setNowMinutes(currentMinutes()), 60_000)
    return () => clearInterval(intervalId)
  }, [])

  const showNowLine = isToday(selectedDate)

  const goPreviousDay = useCallback(() => setSelectedDate((day) => subDays(day, 1)), [])
  const goNextDay = useCallback(() => setSelectedDate((day) => addDays(day, 1)), [])
  const goToday = useCallback(() => setSelectedDate(new Date()), [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const habitId = String(event.active.id)
      const habit = habitsById.get(habitId)
      if (!habit) return
      const draggedMinutes = (
        event.active.data.current as { minutes?: number } | undefined
      )?.minutes
      const startMinutes =
        typeof draggedMinutes === 'number' ? draggedMinutes : (parseMinutes(habit.dueTime) ?? 0)
      const deltaMinutes = (event.delta.y / HOUR_HEIGHT) * 60
      const snapped = Math.round((startMinutes + deltaMinutes) / SNAP_MINUTES) * SNAP_MINUTES
      const nextDueTime = minutesToTime(snapped)
      if (nextDueTime === habit.dueTime) return
      const nextDueEndTime = shiftedEndTime(habit, snapped)

      const key = habitKeys.calendar(dateStr, dateStr)
      const previous = queryClient.getQueryData<CalendarMonthResponse>(key)
      if (previous) {
        queryClient.setQueryData<CalendarMonthResponse>(
          key,
          patchHabitTime(previous, habitId, nextDueTime, nextDueEndTime),
        )
      }

      updateHabit.mutate(
        { habitId, data: buildTimeRescheduleRequest(habit, nextDueTime, nextDueEndTime) },
        {
          onSuccess: () => showSuccess(t('calendar.rescheduled')),
          onError: () => {
            if (previous) queryClient.setQueryData(key, previous)
            showError(t('errors.updateHabit'))
          },
        },
      )
    },
    [habitsById, dateStr, queryClient, updateHabit, showSuccess, showError, t],
  )

  const isEmpty = !isLoading && visibleEntries.length === 0

  return (
    <div style={{ padding: '0 20px 16px' }}>
      <div className="shrink-0" style={{ padding: '12px 0 14px' }}>
        <AgendaDayNav
          label={dayLabel}
          previousLabel={t('calendar.agenda.previousDay')}
          nextLabel={t('calendar.agenda.nextDay')}
          todayLabel={t('calendar.agenda.today')}
          onPrevious={goPreviousDay}
          onNext={goNextDay}
          onToday={goToday}
        />
      </div>

      {error ? (
        <CalendarLoadError onRetry={refresh} />
      ) : (
        <>
      <div className="flex items-center justify-between" style={{ gap: 12, padding: '0 0 8px' }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {t('calendar.agenda.dragHint')}
        </p>
        <ShowRecurringToggle checked={showRecurring} onChange={onShowRecurringChange} />
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          data-testid="calendar-agenda"
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          {allDayEntries.length > 0 && (
            <div
              data-testid="agenda-all-day-band"
              className="grid"
              style={{
                gridTemplateColumns: `${GUTTER}px 1fr`,
                borderBottom: '1px solid var(--hairline)',
                ...pinnedPaneBackground,
              }}
            >
              <div
                className="flex items-start justify-end"
                style={{ padding: '8px 8px 0' }}
              >
                <span
                  className="uppercase"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    color: 'var(--fg-4)',
                  }}
                >
                  {t('calendar.timeGrid.allDay')}
                </span>
              </div>
              <div className="flex flex-col" style={{ gap: 4, padding: '8px' }}>
                {allDayEntries.map((entry) => (
                  <AgendaAllDayChip key={entry.habitId} entry={entry} />
                ))}
              </div>
            </div>
          )}

          <div
            ref={bodyRef}
            className="thin-scrollbar relative"
            style={{ overflow: 'auto', maxHeight: 'min(720px, calc(100dvh - 280px))' }}
          >
            <div className="grid" style={{ gridTemplateColumns: `${GUTTER}px 1fr` }}>
              <div aria-hidden="true" className="relative" style={{ height: DAY_HEIGHT }}>
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-2"
                    style={{
                      top: hour * HOUR_HEIGHT + 2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--fg-4)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {displayTime(`${String(hour).padStart(2, '0')}:00`)}
                  </span>
                ))}
              </div>

              <div
                style={{
                  position: 'relative',
                  height: DAY_HEIGHT,
                  borderLeft: '1px solid var(--hairline)',
                }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0"
                    style={{ top: hour * HOUR_HEIGHT, borderTop: '1px solid var(--hairline)' }}
                  />
                ))}
                {timedBlocks.map((block) => (
                  <AgendaEventBlock
                    key={block.entry.habitId}
                    block={block}
                    displayTime={displayTime}
                  />
                ))}

                {showNowLine && (
                  <div
                    className="absolute left-0 right-0 flex items-center"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT, pointerEvents: 'none' }}
                    aria-label={t('calendar.timeGrid.now')}
                  >
                    <span
                      className="shrink-0 rounded-full"
                      style={{ width: 8, height: 8, marginLeft: -4, background: 'var(--primary)' }}
                    />
                    <span style={{ height: 1.5, flex: 1, background: 'var(--primary)' }} />
                  </div>
                )}
              </div>
            </div>

            {isEmpty && (
              <div
                data-testid="agenda-empty"
                className="absolute inset-0 flex items-center justify-center"
                style={{ pointerEvents: 'none', padding: 24 }}
              >
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
                  {t('calendar.agenda.empty')}
                </span>
              </div>
            )}
          </div>
        </div>
      </DndContext>
        </>
      )}
    </div>
  )
}

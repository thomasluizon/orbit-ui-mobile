'use client'

import { useState, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  addMonths,
  subMonths,
  setYear,
  addWeeks,
  subWeeks,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useLocale, useTranslations } from 'next-intl'
import {
  formatAPIDate,
  parseAPIDate,
  capitalizeFirstLetter,
  filterRecurringEntries,
  filterCalendarSyncEventsByDate,
  clampRangeToMaxDays,
  MAX_RANGE_DAYS,
} from '@orbit/shared/utils'
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProfile } from '@/hooks/use-profile'
import { buildCalendarMonthModel } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsDesktop, useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useToday } from '../today-provider'
import {
  CalendarHeader,
  CalendarLegend,
} from './_components/calendar-shell'

const SWIPE_THRESHOLD = 50

type MonthSlide = 'left' | 'right' | null
type CalendarView = 'month' | 'week' | 'range' | 'agenda'

function resolveMonthSlideClass(monthSlide: MonthSlide): string {
  if (monthSlide === 'right') return 'animate-slide-date-right'
  if (monthSlide === 'left') return 'animate-slide-date-left'
  return ''
}

export default function CalendarPage() {
  const t = useTranslations()
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const monthQuery = useCalendarData(currentMonth)

  if (!profile) {
    return (
      <div style={{ padding: '16px 4px' }}>
        {profileError ? (
          <CalendarLoadError onRetry={() => void refetchProfile()} />
        ) : (
          <Skeleton variant="grid" rows={6} cols={7} cell={44} gap={0} label={t('common.loading')} />
        )}
      </div>
    )
  }

  return (
    <CalendarPageContent
      profile={profile}
      currentMonth={currentMonth}
      setCurrentMonth={setCurrentMonth}
      monthQuery={monthQuery}
    />
  )
}

interface CalendarPageContentProps {
  profile: Pick<Profile, 'weekStartDay'>
  currentMonth: Date
  setCurrentMonth: Dispatch<SetStateAction<Date>>
  monthQuery: ReturnType<typeof useCalendarData>
}

// react-doctor-disable-next-line no-giant-component -- calendar shell hosting four distinct views (month/week/range/agenda); extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarPageContent({
  profile,
  currentMonth,
  setCurrentMonth,
  monthQuery,
}: Readonly<CalendarPageContentProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()
  const weekStartsOn = profile.weekStartDay
  const isDesktop = useIsDesktop()
  const isWideDesktop = useIsWideDesktop()
  const todayKey = useToday()

  const [view, setView] = useState<CalendarView>('month')
  /** Agenda is desktop-width only until #56 stage 10 builds the mobile day groups. */
  const activeView: CalendarView = !isDesktop && view === 'agenda' ? 'month' : view
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [weekSlide, setWeekSlide] = useState<MonthSlide>(null)
  const [rangeStart, setRangeStart] = useState(() => formatAPIDate(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => formatAPIDate(new Date()))
  const [awaitingEnd, setAwaitingEnd] = useState(false)
  const [rangeClamped, setRangeClamped] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  )
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [showRecurring, setShowRecurring] = useState(true)
  const { data: calendarEventsResult } = useCalendarEvents()

  const { dayMap, isLoading, isFetching, error, refresh } = monthQuery

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn }),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [weekAnchor, weekStartsOn],
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn }),
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is derived from profile.weekStartDay every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [weekAnchor, weekStartsOn],
  )
  const rangeBounds = useMemo(() => {
    const a = parseAPIDate(rangeStart)
    const b = parseAPIDate(rangeEnd)
    return rangeStart <= rangeEnd ? { lo: a, hi: b } : { lo: b, hi: a }
  }, [rangeStart, rangeEnd])

  const [gridStartDate, gridEndDate] =
    view === 'week' ? [weekStart, weekEnd] : [rangeBounds.lo, rangeBounds.hi]

  const {
    dayMap: rangeDayMap,
    isLoading: rangeLoading,
    isFetching: rangeFetching,
    error: rangeError,
    refresh: rangeRefresh,
  } = useCalendarRange(gridStartDate, gridEndDate, view === 'week' || view === 'range')

  const gridColumns = useMemo<TimeGridColumn[]>(() => {
    const days =
      view === 'week'
        ? eachDayOfInterval({ start: weekStart, end: weekEnd })
        : eachDayOfInterval({ start: rangeBounds.lo, end: rangeBounds.hi })
    return days.map((date) => ({
      date,
      dateStr: formatAPIDate(date),
      isToday: isToday(date),
    }))
  }, [view, weekStart, weekEnd, rangeBounds])

  const monthLabel = useMemo(
    () => capitalizeFirstLetter(format(currentMonth, 'MMMM', { locale: dateFnsLocale })),
    [currentMonth, dateFnsLocale],
  )
  const currentYear = currentMonth.getFullYear()

  const displayRangeDayMap = useMemo(() => {
    if (showRecurring) return rangeDayMap
    const filtered = new Map<string, CalendarDayEntry[]>()
    for (const [key, entries] of rangeDayMap) {
      filtered.set(key, filterRecurringEntries(entries, false))
    }
    return filtered
  }, [rangeDayMap, showRecurring])

  const weekLabel = useMemo(() => {
    const startLabel = format(weekStart, 'MMM d', { locale: dateFnsLocale })
    const endLabel = isSameMonth(weekStart, weekEnd)
      ? format(weekEnd, 'd', { locale: dateFnsLocale })
      : format(weekEnd, 'MMM d', { locale: dateFnsLocale })
    return `${startLabel} - ${endLabel}`
  }, [weekStart, weekEnd, dateFnsLocale])

  const {
    dayMap: activeDayMap,
    isFetching: activeFetching,
    error: activeError,
    refresh: activeRefresh,
  } =
    activeView === 'month'
      ? { dayMap, isFetching, error, refresh }
      : {
          dayMap: rangeDayMap,
          isFetching: rangeFetching,
          error: rangeError,
          refresh: rangeRefresh,
        }

  const prevMonth = useCallback(() => {
    setMonthSlide('left')
    setCurrentMonth((m) => subMonths(m, 1))
  }, [setCurrentMonth])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    setCurrentMonth((m) => addMonths(m, 1))
  }, [setCurrentMonth])

  const selectYear = useCallback((year: number) => {
    setMonthSlide(null)
    setCurrentMonth((m) => startOfMonth(setYear(m, year)))
  }, [setCurrentMonth])

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null)
    setCurrentMonth(startOfMonth(new Date()))
  }, [setCurrentMonth])

  const prevWeek = useCallback(() => {
    setWeekSlide('left')
    setWeekAnchor((a) => subWeeks(a, 1))
  }, [])
  const nextWeek = useCallback(() => {
    setWeekSlide('right')
    setWeekAnchor((a) => addWeeks(a, 1))
  }, [])
  const goToCurrentWeek = useCallback(() => {
    setWeekSlide(null)
    setWeekAnchor(new Date())
  }, [])

  const showInlineDayPanel = isWideDesktop && activeView === 'month'

  const openDay = useCallback(
    (dateStr: string) => {
      setSelectedDay(dateStr)
      if (!showInlineDayPanel) setIsDayDetailOpen(true)
    },
    [showInlineDayPanel],
  )

  function handleRangePick(dateStr: string) {
    if (!awaitingEnd) {
      setRangeStart(dateStr)
      setRangeEnd(dateStr)
      setAwaitingEnd(true)
      setRangeClamped(false)
      return
    }
    const { start, end, clamped } = clampRangeToMaxDays(rangeStart, dateStr)
    setRangeStart(start)
    setRangeEnd(end)
    setRangeClamped(clamped)
    setAwaitingEnd(false)
  }

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return activeDayMap.get(selectedDay) ?? []
  }, [selectedDay, activeDayMap])

  const selectedCalendarEvents = useMemo(
    () =>
      calendarEventsResult?.status === 'connected'
        ? filterCalendarSyncEventsByDate(calendarEventsResult.events, selectedDay)
        : [],
    [calendarEventsResult, selectedDay],
  )

  const dayDetailTitle = useMemo(() => {
    if (!selectedDay) return ''
    return capitalizeFirstLetter(displayWeekdayDate(parseAPIDate(selectedDay)))
  }, [selectedDay, displayWeekdayDate])

  const { monthStats } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn),
    [currentMonth, dayMap, weekStartsOn],
  )

  const monthStatTiles = useMemo(
    () => [
      { key: 'bestStreak', emoji: '🔥', value: monthStats.bestStreak, label: t('calendar.bestStreak') },
      { key: 'totalLogs', emoji: '✅', value: monthStats.totalLogs, label: t('calendar.totalLogs') },
      { key: 'missed', emoji: '⚠️', value: monthStats.missed, label: t('calendar.missedCount') },
    ],
    [monthStats, t],
  )

  const viewOptions = useMemo(() => {
    const month = { value: 'month' as const, label: t('calendar.view.month') }
    const week = { value: 'week' as const, label: t('calendar.view.week') }
    const range = { value: 'range' as const, label: t('calendar.view.range') }
    if (!isDesktop) return [month, week, range] as const
    return [month, week, range, { value: 'agenda' as const, label: t('calendar.view.agenda') }] as const
  }, [t, isDesktop])

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStart.current === null) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - touchStart.current.x
    const deltaY = touch.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return
    if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return
    if (deltaX < 0) {
      setMonthSlide('right')
      setCurrentMonth((m) => addMonths(m, 1))
    } else {
      setMonthSlide('left')
      setCurrentMonth((m) => subMonths(m, 1))
    }
  }, [setCurrentMonth])

  const monthSlideClass = resolveMonthSlideClass(monthSlide)

  const calendarHeader = (
    <CalendarHeader
      monthLabel={monthLabel}
      year={currentYear}
      previousMonthLabel={t('common.previousMonth')}
      nextMonthLabel={t('common.nextMonth')}
      currentMonthLabel={t('calendar.goToCurrentMonth')}
      selectYearLabel={t('common.selectYear')}
      onPreviousMonth={prevMonth}
      onNextMonth={nextMonth}
      onCurrentMonth={goToCurrentMonth}
      onSelectYear={selectYear}
    />
  )

  return (
    <div className="relative">
      <div className="relative z-[1]">
        <div style={{ padding: '12px 16px 16px' }}>
          <SegmentedControl<CalendarView>
            options={viewOptions}
            value={activeView}
            onChange={setView}
            label={t('calendar.view.switchLabel')}
          />
        </div>

        <div
          className={`loading-bar w-full transition-opacity duration-[var(--dur-slow)] ${
            activeFetching ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {activeView === 'range' && calendarHeader}

        {activeError && activeView !== 'agenda' ? (
          <div style={{ padding: '12px 16px 16px' }}>
            <CalendarLoadError onRetry={() => void activeRefresh()} />
          </div>
        ) : (
          <>
            {activeView === 'month' && (
              <div className="lg:grid lg:grid-cols-[minmax(440px,55%)_minmax(0,1fr)] lg:items-start">
                <div>
                  {calendarHeader}
                  <div
                    key={format(currentMonth, 'yyyy-MM')}
                    className={monthSlideClass}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    <CalendarGrid
                      currentMonth={currentMonth}
                      dayMap={dayMap}
                      onSelectDay={openDay}
                      selectedDateStr={selectedDay}
                      isLoading={isLoading}
                      weekStartsOn={weekStartsOn}
                      todayKey={todayKey}
                    />
                  </div>

                  <CalendarLegend
                    loggableLabel={t('calendar.legend.loggable')}
                    fullLabel={t('calendar.dayCell.full')}
                    partialLabel={t('calendar.dayCell.partial')}
                    noneLabel={t('calendar.dayCell.none')}
                  />

                  {!isLoading && !monthStats.hasEntries ? (
                    <EmptyState title={t('calendar.emptyMonth')} />
                  ) : (
                    <>
                      <SectionLabel>{t('calendar.thisMonth')}</SectionLabel>
                      <CalendarStats stats={monthStatTiles} />
                    </>
                  )}
                </div>

                {showInlineDayPanel && (
                  <section
                    data-testid="calendar-day-panel"
                    aria-label={dayDetailTitle}
                    className="sticky top-16 flex h-[calc(100dvh-84px)] flex-col"
                    style={{ padding: '16px 0 8px 4px' }}
                  >
                    <h2
                      className="min-w-0 shrink-0 truncate"
                      style={{
                        margin: 0,
                        padding: '0 0 12px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 20,
                        fontWeight: 500,
                        color: 'var(--fg-1)',
                      }}
                    >
                      {dayDetailTitle}
                    </h2>
                    <CalendarDayDetail
                      dateStr={selectedDay}
                      entries={selectedEntries}
                      calendarEvents={selectedCalendarEvents}
                      showRecurring={showRecurring}
                      onShowRecurringChange={setShowRecurring}
                      fitViewport
                    />
                  </section>
                )}
              </div>
            )}

            {view === 'week' && (
              <CalendarWeekView
                columns={gridColumns}
                dayMap={displayRangeDayMap}
                weekLabel={weekLabel}
                previousWeekLabel={t('common.previousWeek')}
                nextWeekLabel={t('common.nextWeek')}
                currentWeekLabel={t('calendar.goToCurrentWeek')}
                slideDirection={weekSlide}
                isLoading={rangeLoading}
                onPreviousWeek={prevWeek}
                onNextWeek={nextWeek}
                onCurrentWeek={goToCurrentWeek}
                onSelectDay={openDay}
                displayTime={displayTime}
                dateFnsLocale={dateFnsLocale}
                allDayLabel={t('calendar.timeGrid.allDay')}
                nowLabel={t('calendar.timeGrid.now')}
                showRecurring={showRecurring}
                onShowRecurringChange={setShowRecurring}
              />
            )}

            {view === 'range' && (
              <CalendarRangeView
                currentMonth={currentMonth}
                monthDayMap={dayMap}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onPickDay={handleRangePick}
                columns={gridColumns}
                rangeDayMap={displayRangeDayMap}
                hint={t('calendar.timeGrid.pickRangeHint')}
                endHint={t('calendar.timeGrid.pickEndHint')}
                clampedNotice={t('calendar.timeGrid.rangeMaxDays', { max: MAX_RANGE_DAYS })}
                isClamped={rangeClamped}
                isAwaitingEnd={awaitingEnd}
                isRangeLoading={rangeLoading}
                onSelectDay={openDay}
                displayTime={displayTime}
                dateFnsLocale={dateFnsLocale}
                allDayLabel={t('calendar.timeGrid.allDay')}
                nowLabel={t('calendar.timeGrid.now')}
                showRecurring={showRecurring}
                onShowRecurringChange={setShowRecurring}
                weekStartsOn={weekStartsOn}
                todayKey={todayKey}
              />
            )}

            {activeView === 'agenda' && (
              <CalendarAgendaView
                displayTime={displayTime}
                dateFnsLocale={dateFnsLocale}
                showRecurring={showRecurring}
                onShowRecurringChange={setShowRecurring}
              />
            )}
          </>
        )}
      </div>

      {isDayDetailOpen && !showInlineDayPanel ? (<Sheet
        open
        onClose={() => (setIsDayDetailOpen)(false)}
        title={dayDetailTitle}
      >
        <CalendarDayDetail
          dateStr={selectedDay}
          entries={selectedEntries}
          calendarEvents={selectedCalendarEvents}
          showRecurring={showRecurring}
          onShowRecurringChange={setShowRecurring}
        />
      </Sheet>) : null}
    </div>
  )
}

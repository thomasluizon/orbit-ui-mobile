'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  addMonths,
  subMonths,
  setYear,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
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
  clampRangeToMaxDays,
  MAX_RANGE_DAYS,
} from '@orbit/shared/utils'
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProfile } from '@/hooks/use-profile'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { AppOverlay } from '@/components/ui/app-overlay'
import { EmptyState } from '@/components/ui/empty-state'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionLabel } from '@/components/ui/section-label'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { useIsDesktop, useIsWideDesktop } from '@/hooks/use-is-desktop'
import {
  CalendarHeader,
  CalendarLegend,
} from './_components/calendar-shell'

const SWIPE_THRESHOLD = 50

type MonthSlide = 'left' | 'right' | null
type CalendarView = 'month' | 'week' | 'range' | 'agenda'

export default function CalendarPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 1
  const isDesktop = useIsDesktop()
  const isWideDesktop = useIsWideDesktop()

  const [view, setView] = useState<CalendarView>('month')
  const activeView: CalendarView = !isDesktop && view === 'agenda' ? 'month' : view
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
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

  const { dayMap, isLoading, isFetching, error, refresh } = useCalendarData(currentMonth)

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn }),
    [weekAnchor, weekStartsOn],
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn }),
    [weekAnchor, weekStartsOn],
  )
  const rangeBounds = useMemo(() => {
    const a = parseAPIDate(rangeStart)
    const b = parseAPIDate(rangeEnd)
    return rangeStart <= rangeEnd ? { lo: a, hi: b } : { lo: b, hi: a }
  }, [rangeStart, rangeEnd])

  const gridStartDate = view === 'week' ? weekStart : rangeBounds.lo
  const gridEndDate = view === 'week' ? weekEnd : rangeBounds.hi

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

  const activeDayMap = activeView === 'month' ? dayMap : rangeDayMap
  const activeFetching = activeView === 'month' ? isFetching : rangeFetching
  const activeError = activeView === 'month' ? error : rangeError
  const activeRefresh = activeView === 'month' ? refresh : rangeRefresh

  const prevMonth = useCallback(() => {
    setMonthSlide('left')
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const selectYear = useCallback((year: number) => {
    setMonthSlide(null)
    setCurrentMonth((m) => startOfMonth(setYear(m, year)))
  }, [])

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null)
    setCurrentMonth(startOfMonth(new Date()))
  }, [])

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

  const dayDetailTitle = useMemo(() => {
    if (!selectedDay) return ''
    return capitalizeFirstLetter(displayWeekdayDate(parseAPIDate(selectedDay)))
  }, [selectedDay, displayWeekdayDate])

  const monthStats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    let totalLogs = 0
    let missed = 0
    let bestStreak = 0
    let currentStreak = 0
    let hasEntries = false

    for (const day of days) {
      const entries: CalendarDayEntry[] = dayMap.get(formatAPIDate(day)) ?? []
      if (entries.length > 0) hasEntries = true
      const completedCount = entries.filter((e) => e.status === 'completed').length
      totalLogs += completedCount
      missed += entries.filter((e) => e.status === 'missed').length

      if (entries.length > 0 && completedCount === entries.length) {
        currentStreak += 1
        if (currentStreak > bestStreak) bestStreak = currentStreak
      } else {
        currentStreak = 0
      }
    }

    return { bestStreak, totalLogs, missed, hasEntries }
  }, [currentMonth, dayMap])

  const monthStatTiles = useMemo(
    () => [
      { key: 'bestStreak', emoji: '🔥', value: monthStats.bestStreak, label: t('calendar.bestStreak') },
      { key: 'totalLogs', emoji: '✅', value: monthStats.totalLogs, label: t('calendar.totalLogs') },
      { key: 'missed', emoji: '⚠️', value: monthStats.missed, label: t('calendar.missedCount') },
    ],
    [monthStats, t],
  )

  const viewTabs = useMemo<SectionHeadTabItem<CalendarView>[]>(() => {
    const base: SectionHeadTabItem<CalendarView>[] = [
      { id: 'month', label: t('calendar.view.month') },
      { id: 'week', label: t('calendar.view.week') },
      { id: 'range', label: t('calendar.view.range') },
    ]
    if (isDesktop) base.push({ id: 'agenda', label: t('calendar.viewAgenda') })
    return base
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
  }, [])

  const monthSlideClass =
    monthSlide === 'right'
      ? 'animate-slide-date-right'
      : monthSlide === 'left'
        ? 'animate-slide-date-left'
        : ''

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
      <div className="md:hidden">
        <GradientTop height={180} />
      </div>
      <div className="relative z-[1]">
        <SectionHeadTabs<CalendarView>
          tabs={viewTabs}
          active={activeView}
          onChange={setView}
          ariaLabel={t('calendar.view.switchLabel')}
        />

        <div
          className={`loading-bar w-full transition-opacity duration-[var(--dur-slow)] ${
            activeFetching ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {activeView === 'range' && calendarHeader}

        {activeError && activeView !== 'agenda' ? (
          <div style={{ padding: '12px 20px 16px' }}>
            <CalendarLoadError onRetry={activeRefresh} />
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
                    />
                  </div>

                  <CalendarLegend
                    todayLabel={t('calendar.legend.today')}
                    doneLabel={t('calendar.legend.done')}
                    partialLabel={t('calendar.legend.partial')}
                    missedLabel={t('calendar.legend.missed')}
                  />

                  {!isLoading && !monthStats.hasEntries ? (
                    <EmptyState description={t('calendar.emptyMonth')} />
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
                    className="sticky top-[72px] flex max-h-[calc(100dvh-84px)] flex-col"
                    style={{ padding: '20px 0 10px 4px' }}
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

      <AppOverlay
        open={isDayDetailOpen && !showInlineDayPanel}
        onOpenChange={setIsDayDetailOpen}
        title={dayDetailTitle}
      >
        <CalendarDayDetail
          dateStr={selectedDay}
          entries={selectedEntries}
          showRecurring={showRecurring}
          onShowRecurringChange={setShowRecurring}
        />
      </AppOverlay>
    </div>
  )
}

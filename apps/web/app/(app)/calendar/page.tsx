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
} from '@orbit/shared/utils'
import { clampRangeToMaxDays, MAX_RANGE_DAYS } from '@/lib/calendar-range'
import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useProfile } from '@/hooks/use-profile'
import { useCoachMark } from '@/hooks/use-coach-mark'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { AppOverlay } from '@/components/ui/app-overlay'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionLabel } from '@/components/ui/section-label'
import { SectionHeadTabs } from '@/components/ui/section-head-tabs'
import {
  CalendarHeader,
  CalendarLegend,
} from './_components/calendar-shell'

const SWIPE_THRESHOLD = 50

type MonthSlide = 'left' | 'right' | null
type CalendarView = 'month' | 'week' | 'range'

export default function CalendarPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { displayTime } = useTimeFormat()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 1
  useCoachMark('coach-calendar')

  const [view, setView] = useState<CalendarView>('month')
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [rangeStart, setRangeStart] = useState(() => formatAPIDate(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => formatAPIDate(new Date()))
  const [awaitingEnd, setAwaitingEnd] = useState(false)
  const [rangeClamped, setRangeClamped] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  )
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [showRecurring, setShowRecurring] = useState(true)

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth)

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
  } = useCalendarRange(gridStartDate, gridEndDate, view !== 'month')

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

  const activeDayMap = view === 'month' ? dayMap : rangeDayMap
  const activeLoading = view === 'month' ? isLoading : rangeLoading
  const activeFetching = view === 'month' ? isFetching : rangeFetching

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

  const prevWeek = useCallback(() => setWeekAnchor((a) => subWeeks(a, 1)), [])
  const nextWeek = useCallback(() => setWeekAnchor((a) => addWeeks(a, 1)), [])
  const goToCurrentWeek = useCallback(() => setWeekAnchor(new Date()), [])

  const openDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr)
    setIsDayDetailOpen(true)
  }, [])

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

  const monthStats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    let totalLogs = 0
    let missed = 0
    let bestStreak = 0
    let currentStreak = 0

    for (const day of days) {
      const entries: CalendarDayEntry[] = dayMap.get(formatAPIDate(day)) ?? []
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

    return { bestStreak, totalLogs, missed }
  }, [currentMonth, dayMap])

  const monthStatTiles = useMemo(
    () => [
      { key: 'bestStreak', emoji: '🔥', value: monthStats.bestStreak, label: t('calendar.bestStreak') },
      { key: 'totalLogs', emoji: '✅', value: monthStats.totalLogs, label: t('calendar.totalLogs') },
      { key: 'missed', emoji: '⚠️', value: monthStats.missed, label: t('calendar.missedCount') },
    ],
    [monthStats, t],
  )

  const touchStartX = useRef<number | null>(null)

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (view !== 'month') return
      const touch = e.touches[0]
      if (touch) touchStartX.current = touch.clientX
    },
    [view],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (view !== 'month' || touchStartX.current === null) return
      const touch = e.changedTouches[0]
      if (!touch) return
      const deltaX = touch.clientX - touchStartX.current
      touchStartX.current = null
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return
      if (deltaX < 0) {
        setMonthSlide('right')
        setCurrentMonth((m) => addMonths(m, 1))
      } else {
        setMonthSlide('left')
        setCurrentMonth((m) => subMonths(m, 1))
      }
    },
    [view],
  )

  const monthSlideClass =
    monthSlide === 'right'
      ? 'animate-slide-date-right'
      : monthSlide === 'left'
        ? 'animate-slide-date-left'
        : ''

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <GradientTop height={180} />
      <div className="relative z-[1]">
        <SectionHeadTabs<CalendarView>
          tabs={[
            { id: 'month', label: t('calendar.view.month') },
            { id: 'week', label: t('calendar.view.week') },
            { id: 'range', label: t('calendar.view.range') },
          ]}
          active={view}
          onChange={setView}
          ariaLabel={t('calendar.view.switchLabel')}
        />

        {(view === 'month' || view === 'range') && (
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
        )}

        <div
          className={`loading-bar w-full transition-opacity duration-300 ${
            activeFetching && !activeLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {view === 'month' && (
          <>
            <div key={format(currentMonth, 'yyyy-MM')} className={monthSlideClass}>
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

            <SectionLabel>{t('calendar.thisMonth')}</SectionLabel>
            <CalendarStats stats={monthStatTiles} />
          </>
        )}

        {view === 'week' && (
          <CalendarWeekView
            columns={gridColumns}
            dayMap={displayRangeDayMap}
            weekLabel={weekLabel}
            previousWeekLabel={t('common.previousWeek')}
            nextWeekLabel={t('common.nextWeek')}
            currentWeekLabel={t('calendar.goToCurrentWeek')}
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
            clampedNotice={t('calendar.timeGrid.rangeMaxDays', { max: MAX_RANGE_DAYS })}
            isClamped={rangeClamped}
            onSelectDay={openDay}
            displayTime={displayTime}
            dateFnsLocale={dateFnsLocale}
            allDayLabel={t('calendar.timeGrid.allDay')}
            nowLabel={t('calendar.timeGrid.now')}
            showRecurring={showRecurring}
            onShowRecurringChange={setShowRecurring}
          />
        )}
      </div>

      <AppOverlay open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
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

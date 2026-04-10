'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { addMonths, subMonths, startOfMonth, format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useLocale, useTranslations } from 'next-intl'
import { useCalendarData } from '@/hooks/use-calendar-data'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import {
  CalendarHeader,
  CalendarLegend,
} from './_components/calendar-shell'

const SWIPE_THRESHOLD = 50

export default function CalendarPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showDayDetail, setShowDayDetail] = useState(false)

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth)

  const monthLabel = useMemo(() => format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale }), [currentMonth, dateFnsLocale])

  // Mini completion summary for the header
  const monthSummary = useMemo(() => {
    if (isLoading || dayMap.size === 0) return null
    let daysWithActivity = 0
    let daysCompleted = 0
    dayMap.forEach((entries: CalendarDayEntry[]) => {
      if (entries.length === 0) return
      daysWithActivity++
      const allDone = entries.every((e) => e.status === 'completed')
      if (allDone) daysCompleted++
    })
    if (daysWithActivity === 0) return null
    const pct = Math.round((daysCompleted / daysWithActivity) * 100)
    return `${daysCompleted}/${daysWithActivity} ${t('calendar.summary.days')} (${pct}%)`
  }, [dayMap, isLoading, t])

  const prevMonth = useCallback(() => {
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()))
  }, [])

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr)
    setShowDayDetail(true)
  }, [])

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return dayMap.get(selectedDay) ?? []
  }, [selectedDay, dayMap])

  // Swipe navigation
  const touchStartX = useRef<number | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (touch) touchStartX.current = touch.clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return
    if (deltaX < 0) {
      setCurrentMonth((m) => addMonths(m, 1))
    } else {
      setCurrentMonth((m) => subMonths(m, 1))
    }
  }, [])

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <CalendarHeader
        title={t('nav.calendar')}
        monthLabel={monthLabel}
        subtitle={monthSummary}
        goToTodayLabel={t('dates.goToToday')}
        previousMonthLabel={t('common.previousMonth')}
        nextMonthLabel={t('common.nextMonth')}
        onGoToToday={goToToday}
        onPreviousMonth={prevMonth}
        onNextMonth={nextMonth}
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="py-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {Array.from({ length: 35 }, (_, i) => (
              <div
                key={i}
                className="aspect-square bg-surface rounded-[var(--radius-xl)] animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {/* Refetch loading bar */}
      <div
        className={`loading-bar w-full transition-opacity duration-300 ${
          isFetching && !isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Calendar grid */}
      {!isLoading && (
        <div
          className={`py-2 transition-opacity duration-200 bg-surface rounded-[var(--radius-xl)] border border-border-muted p-3 shadow-[var(--shadow-sm)] ${
            isFetching ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          <CalendarGrid
            currentMonth={currentMonth}
            dayMap={dayMap}
            onSelectDay={onSelectDay}
          />
        </div>
      )}

      <CalendarLegend
        doneLabel={t('calendar.legend.done')}
        upcomingLabel={t('calendar.legend.upcoming')}
        missedLabel={t('calendar.legend.missed')}
      />

      {/* Day detail overlay */}
      <CalendarDayDetail
        open={showDayDetail}
        onOpenChange={setShowDayDetail}
        dateStr={selectedDay}
        entries={selectedEntries}
      />
    </div>
  )
}

'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useLocale, useTranslations } from 'next-intl'
import { formatAPIDate } from '@orbit/shared/utils'
import { useCalendarData } from '@/hooks/use-calendar-data'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { AppOverlay } from '@/components/ui/app-overlay'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import {
  CalendarHeader,
  CalendarLegend,
} from './_components/calendar-shell'

const SWIPE_THRESHOLD = 50

type MonthSlide = 'left' | 'right' | null

export default function CalendarPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [monthSlide, setMonthSlide] = useState<MonthSlide>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(() =>
    formatAPIDate(new Date()),
  )
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth)

  const monthLabel = useMemo(
    () => format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale }),
    [currentMonth, dateFnsLocale],
  )

  const prevMonth = useCallback(() => {
    setMonthSlide('left')
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const goToCurrentMonth = useCallback(() => {
    setMonthSlide(null)
    setCurrentMonth(startOfMonth(new Date()))
  }, [])

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr)
    setIsDayDetailOpen(true)
  }, [])

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return dayMap.get(selectedDay) ?? []
  }, [selectedDay, dayMap])

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

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <GradientTop height={180} />
      <div className="relative z-[1]">
        <CalendarHeader
          monthLabel={monthLabel}
          previousMonthLabel={t('common.previousMonth')}
          nextMonthLabel={t('common.nextMonth')}
          currentMonthLabel={t('calendar.goToCurrentMonth')}
          onPreviousMonth={prevMonth}
          onNextMonth={nextMonth}
          onCurrentMonth={goToCurrentMonth}
        />

        <div
          className={`loading-bar w-full transition-opacity duration-300 ${
            isFetching && !isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        <div key={format(currentMonth, 'yyyy-MM')} className={monthSlideClass}>
          <CalendarGrid
            currentMonth={currentMonth}
            dayMap={dayMap}
            onSelectDay={onSelectDay}
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
        <SettingsRow
          label={t('calendar.bestStreak')}
          value={String(monthStats.bestStreak)}
          accessory="none"
          mono
        />
        <SettingsRow
          label={t('calendar.totalLogs')}
          value={String(monthStats.totalLogs)}
          accessory="none"
          mono
        />
        <SettingsRow
          label={t('calendar.missedCount')}
          value={String(monthStats.missed)}
          accessory="none"
          mono
          divider={false}
        />
      </div>

      <AppOverlay open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
        <CalendarDayDetail dateStr={selectedDay} entries={selectedEntries} />
      </AppOverlay>
    </div>
  )
}

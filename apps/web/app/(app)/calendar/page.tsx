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
import { plural } from '@/lib/plural'
import { useCalendarData } from '@/hooks/use-calendar-data'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
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

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth)

  const monthLabel = useMemo(
    () => format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale }),
    [currentMonth, dateFnsLocale],
  )

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
    return `${daysCompleted}/${daysWithActivity} ${plural(t('calendar.summary.days'), daysCompleted)} (${pct}%)`
  }, [dayMap, isLoading, t])

  const prevMonth = useCallback(() => {
    setMonthSlide('left')
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setMonthSlide('right')
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr)
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
          subtitle={monthSummary}
          previousMonthLabel={t('common.previousMonth')}
          nextMonthLabel={t('common.nextMonth')}
          onPreviousMonth={prevMonth}
          onNextMonth={nextMonth}
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

        <CalendarDayDetail dateStr={selectedDay} entries={selectedEntries} />

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
    </div>
  )
}

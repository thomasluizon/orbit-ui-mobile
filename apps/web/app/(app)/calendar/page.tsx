'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
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
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
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

  const monthLabel = useMemo(
    () => format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale }),
    [currentMonth, dateFnsLocale],
  )

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
    return `${daysCompleted}/${daysWithActivity} ${plural(t('calendar.summary.days'), daysCompleted)} (${pct}%)`
  }, [dayMap, isLoading, t])

  const prevMonth = useCallback(() => {
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr)
    setShowDayDetail(true)
  }, [])

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return dayMap.get(selectedDay) ?? []
  }, [selectedDay, dayMap])

  // "Este mês" stat strip — mirrors mobile: best streak / total logs / missed
  // computed from current-month days only.
  const monthStats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    let totalLogs = 0
    let missed = 0
    let bestStreak = 0
    let currentStreak = 0

    for (const day of days) {
      if (!isSameMonth(day, currentMonth)) continue
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
        previousMonthLabel={t('common.previousMonth')}
        nextMonthLabel={t('common.nextMonth')}
        onPreviousMonth={prevMonth}
        onNextMonth={nextMonth}
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div style={{ padding: '16px 20px' }}>
          <div className="grid grid-cols-7" style={{ gap: 6 }}>
            {Array.from({ length: 35 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  height: 40,
                  background: 'var(--bg-sunk)',
                  borderRadius: 6,
                }}
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
        <CalendarGrid
          currentMonth={currentMonth}
          dayMap={dayMap}
          onSelectDay={onSelectDay}
        />
      )}

      <CalendarLegend
        doneLabel={t('calendar.legend.done')}
        upcomingLabel={t('calendar.legend.upcoming')}
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

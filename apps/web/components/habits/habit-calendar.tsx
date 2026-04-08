'use client'

import { useState, useMemo, useCallback } from 'react'
import { addMonths, subMonths, format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildHabitCalendarDayCells,
  buildHabitCalendarWeekdayKeys,
  buildHabitLogDateSet,
} from '@orbit/shared/utils'
import { useHabitLogs } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import type { HabitLog } from '@orbit/shared/types/calendar'

interface HabitCalendarProps {
  habitId: string
  logs?: HabitLog[] | null
}

export function HabitCalendar({ habitId, logs: externalLogs }: Readonly<HabitCalendarProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  const { data: fetchedLogs } = useHabitLogs(externalLogs ? null : habitId)
  const logs = externalLogs ?? fetchedLogs ?? []
  const { profile } = useProfile()
  const weekStartsOn = (profile?.weekStartDay ?? 1) as 0 | 1

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const logDates = useMemo(() => buildHabitLogDateSet(logs), [logs])

  const monthLabel = useMemo(
    () =>
      format(currentMonth, locale === 'pt-BR' ? "MMMM 'de' yyyy" : 'MMMM yyyy', {
        locale: dateFnsLocale,
      }),
    [currentMonth, dateFnsLocale, locale],
  )

  const weekdays = useMemo(
    () =>
      buildHabitCalendarWeekdayKeys(weekStartsOn).map((key) => ({
        key,
        label: t(`dates.daysShort.${key}` as Parameters<typeof t>[0]).charAt(0), // NOSONAR - dynamic i18n key requires assertion
      })),
    [t, weekStartsOn],
  )

  const calendarDays = useMemo(
    () => buildHabitCalendarDayCells(currentMonth, weekStartsOn, logDates),
    [currentMonth, logDates, weekStartsOn],
  )

  const totalInMonth = useMemo(
    () => calendarDays.filter((day) => day.isCurrentMonth && day.isCompleted).length,
    [calendarDays],
  )

  const selectedDayLogs = useMemo<HabitLog[]>(() => {
    if (!selectedDate) return []
    return logs.filter((log) => log.date === selectedDate)
  }, [logs, selectedDate])

  const prevMonth = useCallback(() => {
    setCurrentMonth((m) => subMonths(m, 1))
    setSelectedDate(null)
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1))
    setSelectedDate(null)
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(new Date())
    setSelectedDate(null)
  }, [])

  const toggleDay = useCallback((dateStr: string) => {
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
  }, [])

  function formatLogTime(createdAtUtc: string): string {
    return format(parseISO(createdAtUtc), 'HH:mm')
  }

  return (
    <div className="bg-surface-ground border border-border-muted rounded-xl p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between mb-4">
        <button
          className="p-1.5 rounded-full hover:bg-surface-elevated/80 transition-all duration-150 text-text-muted hover:text-text-primary"
          onClick={prevMonth}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          className="text-sm font-bold text-text-primary capitalize hover:text-primary transition-colors"
          onClick={goToToday}
        >
          {monthLabel}
        </button>
        <button
          className="p-1.5 rounded-full hover:bg-surface-elevated/80 transition-all duration-150 text-text-muted hover:text-text-primary"
          onClick={nextMonth}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {weekdays.map((day) => (
          <div
            key={day.key}
            className="text-center text-[10px] font-bold uppercase tracking-wider text-text-muted py-1"
          >
            {day.label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarDays.map((day) => (
          <div
            key={day.dateStr}
            className="aspect-square flex items-center justify-center relative"
          >
            {day.isCurrentMonth && day.isCompleted ? (
              <button
                className={`size-8 flex items-center justify-center rounded-full text-xs font-bold transition-all cursor-pointer bg-primary text-white hover:brightness-110 ${
                  selectedDate === day.dateStr
                    ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
                    : ''
                }`}
                onClick={() => toggleDay(day.dateStr)}
              >
                {day.dayNum}
              </button>
            ) : (
              <div
                className={`size-8 flex items-center justify-center rounded-full text-xs font-medium transition-all ${
                  day.isCurrentMonth ? '' : 'opacity-0'
                } ${
                  day.isCurrentMonth && day.isToday
                    ? 'ring-1 ring-primary/50 text-text-primary'
                    : ''
                } ${day.isCurrentMonth && !day.isToday ? 'text-text-muted' : ''}`}
              >
                {day.dayNum}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedDate && selectedDayLogs.length > 0 && (
        <div className="mt-3 bg-surface-ground border border-border-muted rounded-lg p-3 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-primary">
              {format(parseISO(selectedDate), 'PPP', {
                locale: dateFnsLocale,
              })}
            </span>
            <button
              className="p-0.5 rounded-full hover:bg-surface-elevated/80 transition-all duration-150 text-text-muted hover:text-text-primary"
              onClick={() => setSelectedDate(null)}
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {selectedDayLogs.map((log) => (
              <div key={log.id} className="flex flex-col gap-0.5">
                {log.note && (
                  <span className="text-xs text-text-primary leading-relaxed">
                    {log.note}
                  </span>
                )}
                <span className="text-[10px] text-text-muted">
                  {log.note
                    ? t('habits.detail.loggedAt', {
                        time: formatLogTime(log.createdAtUtc),
                      })
                    : t('habits.detail.completed')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 px-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          {t('calendar.completionHistory')}
        </span>
        <span className="text-xs font-bold text-primary">
          {totalInMonth}{' '}
          {totalInMonth === 1 ? t('habits.detail.day') : t('habits.detail.days')}
        </span>
      </div>
    </div>
  )
}

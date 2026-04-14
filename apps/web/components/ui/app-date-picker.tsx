'use client'

import { useState, useEffect, useId, useRef, useCallback, useMemo } from 'react'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { formatLocaleDate } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

interface AppDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function AppDatePicker({
  value,
  onChange,
  placeholder,
}: Readonly<AppDatePickerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const weekStartsOn = (profile?.weekStartDay ?? 0) as 0 | 1
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(new Date())
  const dialogLabelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parseISO(value) : null

  useEffect(() => {
    if (value) setViewDate(parseISO(value))
  }, [value])

  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const monthLabel = format(viewDate, 'MMMM yyyy', { locale: dateFnsLocale })

  const weekDays = useMemo(() => {
    const sundayFirst = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const keys = weekStartsOn === 1
      ? [...sundayFirst.slice(1), sundayFirst[0]]
      : sundayFirst
    return keys.map((key) => ({
      key,
      label: t(`dates.daysShort.${key}`).charAt(0),
    }))
  }, [weekStartsOn, t])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(viewDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [viewDate, weekStartsOn])

  const calendarWeeks = (() => {
    const weeks: Date[][] = []
    for (let index = 0; index < calendarDays.length; index += 7) {
      weeks.push(calendarDays.slice(index, index + 7))
    }
    return weeks
  })()

  function prevMonth() {
    setViewDate((d) => subMonths(d, 1))
  }

  function nextMonth() {
    setViewDate((d) => addMonths(d, 1))
  }

  function selectDay(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const displayValue = value ? formatLocaleDate(value, locale) : ''

  // Close on click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    },
    []
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, handleClickOutside])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={displayValue ? t('common.selectedDate', { date: displayValue }) : t('common.selectDate')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="w-full bg-surface text-text-primary rounded-md py-3 px-4 text-sm border border-border text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-[var(--duration-fast)]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{displayValue || placeholder || t('common.selectDate')}</span>
        <Calendar className="size-4 text-text-muted" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />

          <dialog
            open
            aria-modal="true"
            aria-labelledby={dialogLabelId}
            className="fixed z-50 left-1/2 top-1/2 m-0 w-[min(90vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-muted bg-surface-overlay p-2.5 text-text-primary shadow-[var(--shadow-lg)]"
          >
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-white/10"
                aria-label={t('common.previousMonth')}
                onClick={prevMonth}
              >
                <ChevronLeft className="size-4 text-text-muted" />
              </button>
              <span
                id={dialogLabelId}
                className="text-xs font-medium text-text-primary capitalize"
                aria-live="polite"
              >
                {monthLabel}
              </span>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-white/10"
                aria-label={t('common.nextMonth')}
                onClick={nextMonth}
              >
                <ChevronRight className="size-4 text-text-muted" />
              </button>
            </div>

            <table className="w-full border-separate border-spacing-0">
              <thead aria-hidden="true">
                <tr>
                  {weekDays.map((day) => (
                    <th
                      key={day.key}
                      scope="col"
                      className="py-1 text-center text-xs font-normal text-text-muted"
                    >
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarWeeks.map((week) => (
                  <tr key={week[0]?.toISOString()}>
                    {week.map((day) => {
                      const isSelected = selectedDate && isSameDay(day, selectedDate)
                      const isToday = isSameDay(day, new Date())
                      const isCurrentMonth = isSameMonth(day, viewDate)

                      return (
                        <td key={day.toISOString()} className="p-0">
                          <button
                            type="button"
                            aria-label={formatLocaleDate(day, locale, {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            aria-pressed={!!isSelected}
                            aria-current={isToday ? 'date' : undefined}
                            className={`flex aspect-square w-full items-center justify-center rounded-lg text-xs transition-colors ${
                              isCurrentMonth
                                ? 'text-text-primary hover:bg-white/10'
                                : 'text-text-muted/40'
                            } ${
                              isSelected
                                ? 'bg-primary text-white hover:bg-primary/80'
                                : ''
                            } ${
                              isToday && !isSelected
                                ? 'ring-1 ring-primary/50'
                                : ''
                            }`}
                            onClick={() => selectDay(day)}
                          >
                            {format(day, 'd')}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </dialog>
        </>
      )}
    </div>
  )
}

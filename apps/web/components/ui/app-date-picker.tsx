'use client'

import { useState, useEffect, useId, useRef, useCallback } from 'react'
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
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

interface AppDatePickerProps {
  value: string
  onChange: (value: string) => void
  minDate?: Date
  maxDate?: Date
  placeholder?: string
}

export function AppDatePicker({
  value,
  onChange,
  placeholder = 'Select date',
}: AppDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(new Date())
  const dialogLabelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parseISO(value) : null

  useEffect(() => {
    if (value) setViewDate(parseISO(value))
  }, [value])

  const monthLabel = format(viewDate, 'MMMM yyyy')

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  const calendarDays = (() => {
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(viewDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  })()

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

  const displayValue = value ? format(parseISO(value), 'MM/dd/yyyy') : ''

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
        aria-label={displayValue ? `Selected date: ${displayValue}` : placeholder}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="w-full bg-surface text-text-primary rounded-md py-3 px-4 text-sm border border-border text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-[var(--duration-fast)]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{displayValue || placeholder}</span>
        <Calendar className="size-4 text-text-muted" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
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
                aria-label="Previous month"
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
                aria-label="Next month"
                onClick={nextMonth}
              >
                <ChevronRight className="size-4 text-text-muted" />
              </button>
            </div>

            <table className="w-full border-separate border-spacing-0">
              <thead aria-hidden="true">
                <tr>
                  {weekDays.map((day, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="py-1 text-center text-xs font-normal text-text-muted"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarWeeks.map((week, weekIndex) => (
                  <tr key={weekIndex}>
                    {week.map((day) => {
                      const isSelected = selectedDate && isSameDay(day, selectedDate)
                      const isToday = isSameDay(day, new Date())
                      const isCurrentMonth = isSameMonth(day, viewDate)

                      return (
                        <td key={day.toISOString()} className="p-0">
                          <button
                            type="button"
                            aria-label={format(day, 'MMMM d, yyyy')}
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

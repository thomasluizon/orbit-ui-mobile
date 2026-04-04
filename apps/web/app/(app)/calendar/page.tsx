'use client'

import { useState, useMemo, useCallback } from 'react'
import { addMonths, subMonths, startOfMonth, format } from 'date-fns'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useCalendarData } from '@/hooks/use-calendar-data'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showDayDetail, setShowDayDetail] = useState(false)

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth)

  const monthLabel = useMemo(() => format(currentMonth, 'MMMM yyyy'), [currentMonth])

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

  return (
    <div>
      {/* Header */}
      <header className="pt-8 pb-2 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
            Calendar
          </h1>
          <button
            className="p-2 rounded-full hover:bg-surface transition-colors"
            onClick={goToToday}
          >
            <Search className="size-[18px] text-text-secondary" />
          </button>
        </div>

        {/* Month navigation pill */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] flex items-center justify-between p-1">
          <button
            className="size-10 rounded-[var(--radius-lg)] flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
            onClick={prevMonth}
          >
            <ChevronLeft className="size-3 text-text-faded" />
          </button>
          <button
            className="text-base font-semibold text-text-primary hover:text-primary transition-colors"
            onClick={goToToday}
          >
            {monthLabel}
          </button>
          <button
            className="size-10 rounded-[var(--radius-lg)] flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
            onClick={nextMonth}
          >
            <ChevronRight className="size-3 text-text-faded" />
          </button>
        </div>
      </header>

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
      {isFetching && !isLoading && (
        <div className="w-full h-0.5 bg-primary/30 rounded overflow-hidden">
          <div className="h-full w-1/3 bg-primary rounded animate-[shimmer_1s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Calendar grid */}
      {!isLoading && (
        <div
          className={`py-2 transition-opacity duration-200 bg-surface rounded-[var(--radius-xl)] border border-border-muted p-3 shadow-[var(--shadow-sm)] ${isFetching ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <CalendarGrid
            currentMonth={currentMonth}
            dayMap={dayMap}
            onSelectDay={onSelectDay}
          />
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 py-4 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-green-500" />
          <span>Done</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          <span>Upcoming</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-orange-500" />
          <span>Missed</span>
        </div>
      </div>

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

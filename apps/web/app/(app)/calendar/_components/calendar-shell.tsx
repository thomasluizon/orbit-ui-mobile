'use client'

import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
interface CalendarHeaderProps {
  title: string
  monthLabel: string
  goToTodayLabel: string
  previousMonthLabel: string
  nextMonthLabel: string
  onGoToToday: () => void
  onPreviousMonth: () => void
  onNextMonth: () => void
}

export function CalendarHeader({
  title,
  monthLabel,
  goToTodayLabel,
  previousMonthLabel,
  nextMonthLabel,
  onGoToToday,
  onPreviousMonth,
  onNextMonth,
}: Readonly<CalendarHeaderProps>) {
  return (
    <header className="pt-8 pb-2 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {title}
        </h1>
        <button
          aria-label={goToTodayLabel}
          className="p-2 rounded-full hover:bg-surface transition-colors"
          onClick={onGoToToday}
        >
          <Search className="size-[18px] text-text-secondary" aria-hidden="true" />
        </button>
      </div>

      <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] flex items-center justify-between p-1">
        <button
          aria-label={previousMonthLabel}
          className="size-10 rounded-[var(--radius-lg)] flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
          onClick={onPreviousMonth}
        >
          <ChevronLeft className="size-3 text-text-faded" aria-hidden="true" />
        </button>
        <button
          className="text-base font-semibold text-text-primary hover:text-primary transition-colors"
          onClick={onGoToToday}
        >
          {monthLabel}
        </button>
        <button
          aria-label={nextMonthLabel}
          className="size-10 rounded-[var(--radius-lg)] flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
          onClick={onNextMonth}
        >
          <ChevronRight className="size-3 text-text-faded" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

interface CalendarLegendProps {
  doneLabel: string
  upcomingLabel: string
  missedLabel: string
}

export function CalendarLegend({
  doneLabel,
  upcomingLabel,
  missedLabel,
}: Readonly<CalendarLegendProps>) {
  return (
    <div className="flex items-center justify-center gap-6 py-4 text-xs text-text-secondary">
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-green-500" />
        <span>{doneLabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary" />
        <span>{upcomingLabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-orange-500" />
        <span>{missedLabel}</span>
      </div>
    </div>
  )
}

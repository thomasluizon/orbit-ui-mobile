'use client'

import { ChevronLeft, ChevronRight } from '@/components/ui/icons'

export interface TodayDateControlProps {
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
}

export function TodayDateControl({
  dayName,
  numericDate,
  isTodaySelected,
  nextDisabled,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  previousLabel,
  todayLabel,
  nextLabel,
}: Readonly<TodayDateControlProps>) {
  return (
    <div className="flex min-h-[53px] items-center gap-2 px-4">
      <button
        type="button"
        aria-label={previousLabel}
        className="icon-btn touch-target shrink-0"
        onClick={onGoToPreviousDay}
      >
        <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="m-0 truncate text-sm font-medium text-[var(--fg-1)]">{dayName}</p>
        <p className="m-0 truncate font-mono text-xs text-[var(--fg-3)]">{numericDate}</p>
      </div>
      {!isTodaySelected ? (
        <button
          type="button"
          className="min-h-11 appearance-none border-0 bg-transparent px-2 text-sm font-medium text-[var(--fg-1)] underline underline-offset-4"
          onClick={onGoToToday}
        >
          {todayLabel}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={nextLabel}
        disabled={nextDisabled}
        className="icon-btn touch-target shrink-0 disabled:cursor-default disabled:opacity-50"
        onClick={onGoToNextDay}
      >
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}

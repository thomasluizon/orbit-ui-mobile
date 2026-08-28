'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { YearPicker } from '@/components/ui/year-picker'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

interface CalendarHeaderProps {
  monthLabel: string
  year: number
  previousMonthLabel: string
  nextMonthLabel: string
  currentMonthLabel: string
  selectYearLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
  onSelectYear: (year: number) => void
}

/** Agenda header mirroring the Today date-nav: single month chevrons flanking a
 *  tappable month label (tap returns to the current month) and a tappable year
 *  that opens a year picker for direct jumps. */
export function CalendarHeader({
  monthLabel,
  year,
  previousMonthLabel,
  nextMonthLabel,
  currentMonthLabel,
  selectYearLabel,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectYear,
}: Readonly<CalendarHeaderProps>) {
  const [isYearOpen, setIsYearOpen] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()

  function handleSelectYear(nextYear: number) {
    closeSheet(() => {
      setIsYearOpen(false)
      onSelectYear(nextYear)
    })
  }

  return (
    <div className="shrink-0" style={{ padding: '12px 20px 16px' }}>
      <div
        data-tour="tour-calendar-month-nav"
        className="flex items-center justify-between w-full"
        style={{ padding: '0 4px' }}
      >
        <button
          type="button"
          aria-label={previousMonthLabel}
          onClick={onPreviousMonth}
          className="icon-btn touch-target shrink-0"
        >
          <ChevronLeft size={22} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
        <div className="flex items-center" style={{ gap: 2 }}>
          <button
            type="button"
            aria-label={currentMonthLabel}
            onClick={onCurrentMonth}
            className="touch-target appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
            style={{
              height: 36,
              padding: '0 10px',
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
            }}
          >
            {monthLabel}
          </button>
          <button
            type="button"
            aria-label={selectYearLabel}
            aria-expanded={isYearOpen}
            aria-haspopup="dialog"
            onClick={() => setIsYearOpen(true)}
            className="touch-target appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
            style={{
              height: 36,
              padding: '0 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 17,
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              color: isYearOpen ? 'var(--primary)' : 'var(--fg-1)',
            }}
          >
            {year}
          </button>
        </div>
        <button
          type="button"
          aria-label={nextMonthLabel}
          onClick={onNextMonth}
          className="icon-btn touch-target shrink-0"
        >
          <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
      </div>

      {isYearOpen ? <Sheet ref={sheetRef} open title={selectYearLabel} onClose={() => setIsYearOpen(false)}>
        <YearPicker selectedYear={year} onSelectYear={handleSelectYear} />
      </Sheet> : null}
    </div>
  )
}

interface CalendarWeekNavProps {
  weekLabel: string
  previousWeekLabel: string
  nextWeekLabel: string
  currentWeekLabel: string
  onPreviousWeek: () => void
  onNextWeek: () => void
  onCurrentWeek: () => void
}

/** Week-granularity nav for the week time-grid: a centered, tappable week-range
 *  label (tap returns to the current week) flanked by prev/next week chevrons. */
export function CalendarWeekNav({
  weekLabel,
  previousWeekLabel,
  nextWeekLabel,
  currentWeekLabel,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
}: Readonly<CalendarWeekNavProps>) {
  return (
    <div className="shrink-0" style={{ padding: '12px 20px 16px' }}>
      <div className="flex items-center justify-between w-full" style={{ padding: '0 4px' }}>
        <button
          type="button"
          aria-label={previousWeekLabel}
          onClick={onPreviousWeek}
          className="icon-btn touch-target shrink-0"
        >
          <ChevronLeft size={22} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={currentWeekLabel}
          onClick={onCurrentWeek}
          className="touch-target appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
          style={{
            height: 36,
            padding: '0 16px',
            fontFamily: 'var(--font-sans)',
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'var(--fg-1)',
          }}
        >
          {weekLabel}
        </button>
        <button
          type="button"
          aria-label={nextWeekLabel}
          onClick={onNextWeek}
          className="icon-btn touch-target shrink-0"
        >
          <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

interface CalendarLegendProps {
  todayLabel: string
  fullLabel: string
  partialLabel: string
  noneLabel: string
}

/** v8 calendar legend — inline row of colored dots + labels, no section header.
 *  Items mirror the grid's day-dot vocabulary exactly. */
export function CalendarLegend({
  todayLabel,
  fullLabel,
  partialLabel,
  noneLabel,
}: Readonly<CalendarLegendProps>) {
  return (
    <div
      data-tour="tour-calendar-legend"
      className="flex flex-wrap items-center justify-center"
      style={{ padding: '14px 20px', gap: 16 }}
    >
      <LegendItem outcome="today" label={todayLabel} />
      <LegendItem outcome="full" label={fullLabel} />
      <LegendItem outcome="partial" label={partialLabel} />
      <LegendItem outcome="none" label={noneLabel} />
    </div>
  )
}

interface LegendItemProps {
  outcome: 'today' | 'full' | 'partial' | 'none'
  label: string
}

function LegendSwatch({ outcome }: Readonly<Pick<LegendItemProps, 'outcome'>>) {
  if (outcome === 'partial') {
    return (
      <svg aria-hidden="true" data-legend-outcome="partial" width="12" height="12" className="shrink-0 -rotate-90">
        <circle cx="6" cy="6" r="5" fill="none" stroke="var(--fg-4)" strokeWidth="2" />
        <circle cx="6" cy="6" r="5" fill="none" pathLength="100" stroke="var(--primary)" strokeDasharray="50 100" strokeLinecap="round" strokeWidth="2" />
      </svg>
    )
  }

  const style = outcome === 'full'
    ? { background: 'var(--fg-1)' }
    : { boxShadow: `inset 0 0 0 2px ${outcome === 'today' ? 'var(--primary)' : 'var(--fg-4)'}` }
  return <span aria-hidden="true" data-legend-outcome={outcome} className="rounded-full shrink-0" style={{ width: 12, height: 12, ...style }} />
}

function LegendItem({ outcome, label }: Readonly<LegendItemProps>) {
  return (
    <span className="inline-flex items-center" style={{ gap: 6 }}>
      <LegendSwatch outcome={outcome} />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--fg-3)',
        }}
      >
        {label}
      </span>
    </span>
  )
}

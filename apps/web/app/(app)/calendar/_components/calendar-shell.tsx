'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface CalendarHeaderProps {
  monthLabel: string
  previousMonthLabel: string
  nextMonthLabel: string
  previousYearLabel: string
  nextYearLabel: string
  currentMonthLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
  onPreviousYear: () => void
  onNextYear: () => void
  onCurrentMonth: () => void
}

/** Agenda header mirroring the Today date-nav: a centered, tappable month label
 *  (tap returns to the current month) flanked by month chevrons and outer
 *  double-chevron year-jump controls. */
export function CalendarHeader({
  monthLabel,
  previousMonthLabel,
  nextMonthLabel,
  previousYearLabel,
  nextYearLabel,
  currentMonthLabel,
  onPreviousMonth,
  onNextMonth,
  onPreviousYear,
  onNextYear,
  onCurrentMonth,
}: Readonly<CalendarHeaderProps>) {
  return (
    <div className="shrink-0" style={{ padding: '12px 20px 16px' }}>
      <div
        data-tour="tour-calendar-month-nav"
        className="flex items-center justify-between w-full"
        style={{ padding: '0 4px' }}
      >
        <div className="flex items-center shrink-0" style={{ gap: 2 }}>
          <button
            type="button"
            aria-label={previousYearLabel}
            onClick={onPreviousYear}
            className="icon-btn shrink-0"
            style={{ width: 36, height: 36 }}
          >
            <ChevronsLeft size={16} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={previousMonthLabel}
            onClick={onPreviousMonth}
            className="icon-btn shrink-0"
            style={{ width: 36, height: 36 }}
          >
            <ChevronLeft size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          aria-label={currentMonthLabel}
          onClick={onCurrentMonth}
          className="capitalize appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.98]"
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
          {monthLabel}
        </button>
        <div className="flex items-center shrink-0" style={{ gap: 2 }}>
          <button
            type="button"
            aria-label={nextMonthLabel}
            onClick={onNextMonth}
            className="icon-btn shrink-0"
            style={{ width: 36, height: 36 }}
          >
            <ChevronRight size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={nextYearLabel}
            onClick={onNextYear}
            className="icon-btn shrink-0"
            style={{ width: 36, height: 36 }}
          >
            <ChevronsRight size={16} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
          </button>
        </div>
      </div>
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
          className="icon-btn shrink-0"
          style={{ width: 36, height: 36 }}
        >
          <ChevronLeft size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={currentWeekLabel}
          onClick={onCurrentWeek}
          className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.98]"
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
          className="icon-btn shrink-0"
          style={{ width: 36, height: 36 }}
        >
          <ChevronRight size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

interface CalendarLegendProps {
  todayLabel: string
  doneLabel: string
  partialLabel: string
  missedLabel: string
}

/** v8 calendar legend — inline row of colored dots + labels, no section header.
 *  Items mirror the grid's day-dot vocabulary exactly. */
export function CalendarLegend({
  todayLabel,
  doneLabel,
  partialLabel,
  missedLabel,
}: Readonly<CalendarLegendProps>) {
  return (
    <div
      data-tour="tour-calendar-legend"
      className="flex flex-wrap items-center justify-center"
      style={{ padding: '14px 20px', gap: 16 }}
    >
      <LegendItem dotColor="var(--primary)" hollow label={todayLabel} />
      <LegendItem dotColor="var(--primary)" label={doneLabel} />
      <LegendItem dotColor="var(--fg-4)" hollow label={partialLabel} />
      <LegendItem dotColor="var(--status-overdue)" label={missedLabel} />
    </div>
  )
}

interface LegendItemProps {
  dotColor: string
  label: string
  hollow?: boolean
}

function LegendItem({ dotColor, label, hollow = false }: Readonly<LegendItemProps>) {
  return (
    <span className="inline-flex items-center" style={{ gap: 6 }}>
      <span
        aria-hidden="true"
        className="rounded-full shrink-0"
        style={
          hollow
            ? { width: 6, height: 6, boxShadow: `inset 0 0 0 1.5px ${dotColor}`, opacity: 0.6 }
            : { width: 6, height: 6, background: dotColor, opacity: 0.6 }
        }
      />
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

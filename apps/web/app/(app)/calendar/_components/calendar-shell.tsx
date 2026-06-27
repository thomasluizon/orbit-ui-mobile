'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { YearPicker } from '@/components/ui/year-picker'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'

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

  useOverlayEscape({ open: isYearOpen, onDismiss: () => setIsYearOpen(false) })

  function handleSelectYear(nextYear: number) {
    onSelectYear(nextYear)
    setIsYearOpen(false)
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
          className="icon-btn shrink-0"
          style={{ width: 36, height: 36 }}
        >
          <ChevronLeft size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
        <div className="flex items-center" style={{ gap: 2 }}>
          <button
            type="button"
            aria-label={currentMonthLabel}
            onClick={onCurrentMonth}
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.98]"
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
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.98]"
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
          className="icon-btn shrink-0"
          style={{ width: 36, height: 36 }}
        >
          <ChevronRight size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
      </div>

      {isYearOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/65"
            aria-hidden="true"
            onClick={() => setIsYearOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selectYearLabel}
            className="fixed z-50 left-1/2 top-1/2 m-0 w-[min(90vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-[var(--bg-sheet)] p-2.5 text-[var(--fg-1)] shadow-[var(--shadow-2),inset_0_0_0_1px_var(--hairline)]"
          >
            <YearPicker selectedYear={year} onSelectYear={handleSelectYear} />
          </div>
        </>
      )}
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

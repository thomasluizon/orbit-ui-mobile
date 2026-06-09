'use client'

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'

interface CalendarHeaderProps {
  title: string
  monthLabel: string
  subtitle?: string | null
  previousMonthLabel: string
  nextMonthLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
}

/** Calendar AppBar — leading CalendarDays glyph, month subtitle, prev/next trailing. */
export function CalendarHeader({
  title,
  monthLabel,
  subtitle,
  previousMonthLabel,
  nextMonthLabel,
  onPreviousMonth,
  onNextMonth,
}: Readonly<CalendarHeaderProps>) {
  return (
    <AppBar
      leadingIcon={<CalendarDays size={17} strokeWidth={1.5} color="var(--fg-2)" />}
      title={title}
      subtitle={subtitle ? `${monthLabel} · ${subtitle}` : monthLabel}
      trailing={
        <div data-tour="tour-calendar-month-nav" className="flex items-center">
          <button
            type="button"
            aria-label={previousMonthLabel}
            onClick={onPreviousMonth}
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center text-[var(--fg-2)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
            style={{ width: 36, height: 36, borderRadius: 8 }}
          >
            <ChevronLeft size={17} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label={nextMonthLabel}
            onClick={onNextMonth}
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center text-[var(--fg-2)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
            style={{ width: 36, height: 36, borderRadius: 8 }}
          >
            <ChevronRight size={17} strokeWidth={1.6} />
          </button>
        </div>
      }
    />
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
      className="flex flex-wrap items-center"
      style={{ padding: '12px 20px', gap: 16 }}
    >
      <LegendItem dotColor="var(--primary)" label={todayLabel} />
      <LegendItem dotColor="var(--fg-1)" label={doneLabel} />
      <LegendItem dotColor="var(--fg-3)" hollow label={partialLabel} />
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
            ? { width: 6, height: 6, boxShadow: `inset 0 0 0 1px ${dotColor}` }
            : { width: 6, height: 6, background: dotColor }
        }
      />
      <span
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          color: 'var(--fg-2)',
        }}
      >
        {label}
      </span>
    </span>
  )
}

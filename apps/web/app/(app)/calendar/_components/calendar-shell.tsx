'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarHeaderProps {
  monthLabel: string
  subtitle?: string | null
  previousMonthLabel: string
  nextMonthLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
}

/** Agenda header — the month itself is the title (24/500), prev/next as icon-btn circles. */
export function CalendarHeader({
  monthLabel,
  subtitle,
  previousMonthLabel,
  nextMonthLabel,
  onPreviousMonth,
  onNextMonth,
}: Readonly<CalendarHeaderProps>) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '14px 20px 0', gap: 12 }}
    >
      <div className="min-w-0 flex-1">
        <h1
          className="capitalize truncate"
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'var(--fg-1)',
          }}
        >
          {monthLabel}
        </h1>
        {subtitle && (
          <div
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div
        data-tour="tour-calendar-month-nav"
        className="flex items-center shrink-0"
        style={{ gap: 4 }}
      >
        <button
          type="button"
          aria-label={previousMonthLabel}
          onClick={onPreviousMonth}
          className="icon-btn"
        >
          <ChevronLeft size={22} strokeWidth={1.8} color="var(--fg-2)" />
        </button>
        <button
          type="button"
          aria-label={nextMonthLabel}
          onClick={onNextMonth}
          className="icon-btn"
        >
          <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-2)" />
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
      className="flex flex-wrap items-center"
      style={{ padding: '12px 20px', gap: 16 }}
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
            ? { width: 6, height: 6, boxShadow: `inset 0 0 0 1.5px ${dotColor}` }
            : { width: 6, height: 6, background: dotColor }
        }
      />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--fg-2)',
        }}
      >
        {label}
      </span>
    </span>
  )
}

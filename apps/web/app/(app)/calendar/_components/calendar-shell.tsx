'use client'

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'

interface CalendarHeaderProps {
  title: string
  monthLabel: string
  subtitle?: string | null
  goToTodayLabel: string
  previousMonthLabel: string
  nextMonthLabel: string
  onGoToToday: () => void
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
        <>
          <button
            type="button"
            aria-label={previousMonthLabel}
            onClick={onPreviousMonth}
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--fg-2)' }}
          >
            <ChevronLeft size={17} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label={nextMonthLabel}
            onClick={onNextMonth}
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--fg-2)' }}
          >
            <ChevronRight size={17} strokeWidth={1.6} />
          </button>
        </>
      }
    />
  )
}

interface CalendarLegendProps {
  doneLabel: string
  upcomingLabel: string
  missedLabel: string
}

/** v8 calendar legend — flush rows under SectionLabel. */
export function CalendarLegend({
  doneLabel,
  upcomingLabel,
  missedLabel,
}: Readonly<CalendarLegendProps>) {
  const t = useTranslations()
  return (
    <div data-tour="tour-calendar-legend">
      <SectionLabel>{t('calendar.legend.sectionTitle')}</SectionLabel>
      <div style={{ padding: '0 20px 12px' }}>
        <LegendRow dot="full" label={doneLabel} />
        <LegendRow dot="primary" label={upcomingLabel} />
        <LegendRow dot="bad" label={missedLabel} />
      </div>
    </div>
  )
}

interface LegendRowProps {
  dot: 'full' | 'primary' | 'bad'
  label: string
}

function LegendRow({ dot, label }: Readonly<LegendRowProps>) {
  let dotEl: React.ReactNode
  if (dot === 'full') {
    dotEl = (
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: 'var(--fg-1)' }}
      />
    )
  } else if (dot === 'primary') {
    dotEl = (
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: 'var(--primary)' }}
      />
    )
  } else {
    dotEl = (
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: 'var(--status-overdue)' }}
      />
    )
  }

  return (
    <div
      className="flex items-center"
      style={{
        padding: '11px 0',
        gap: 12,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <span className="inline-flex items-center justify-center shrink-0" style={{ width: 14 }}>
        {dotEl}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          color: 'var(--fg-1)',
        }}
      >
        {label}
      </span>
    </div>
  )
}

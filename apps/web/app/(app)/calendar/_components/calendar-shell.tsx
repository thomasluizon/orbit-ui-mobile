"use client"

import { useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { YearPicker } from '@/components/ui/year-picker'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { formatCalendarMonthHeading, formatLocaleDate } from '@orbit/shared/utils'

interface CalendarHeaderProps {
  currentMonth: Date
  todayKey: string
  previousMonthLabel: string
  nextMonthLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
  onSelectMonth: (month: number, year: number) => void
  viewSelector?: ReactNode
  showMonthNavigation?: boolean
}

const headerButton = 'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full border-0 bg-[var(--bg-field)] text-[var(--fg-2)] cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]'

function CalendarMonthPicker({ currentMonth, onSelectMonth, choosingYear, setChoosingYear, year, setYear }: Readonly<Pick<CalendarHeaderProps, 'currentMonth' | 'onSelectMonth'> & { choosingYear: boolean; setChoosingYear: (choosing: boolean) => void; year: number; setYear: (year: number) => void }>) {
  const t = useTranslations()
  const locale = useLocale()
  return <div className="flex flex-col gap-4">
    <button type="button" className={`${headerButton} self-center px-3`} onClick={() => setChoosingYear(!choosingYear)}
      aria-label={t('common.selectYear')} aria-expanded={choosingYear}>{year}<ChevronDown size={16} strokeWidth={2} aria-hidden="true" /></button>
    {choosingYear ? <YearPicker selectedYear={year} onSelectYear={(nextYear) => { setYear(nextYear); setChoosingYear(false) }} /> :
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6em), 1fr))' }}>
        {Array.from({ length: 12 }, (_, month) => <button key={month} type="button"
          className={`${headerButton} rounded-[12px] px-2`} aria-pressed={month === currentMonth.getMonth() && year === currentMonth.getFullYear()}
          onClick={() => onSelectMonth(month, year)}>{formatLocaleDate(new Date(year, month, 1), locale, { month: 'short' })}</button>)}
      </div>}
  </div>
}

export function CalendarHeader({ currentMonth, todayKey, previousMonthLabel, nextMonthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, onSelectMonth, viewSelector, showMonthNavigation = true }: Readonly<CalendarHeaderProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const [year, setYear] = useState(currentMonth.getFullYear())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [choosingYear, setChoosingYear] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const heading = formatCalendarMonthHeading(currentMonth, todayKey, locale)
  const chooseMonth = (month: number, year: number) => closeSheet(() => { setPickerOpen(false); onSelectMonth(month, year) })
  return <div data-testid="calendar-header-group" className="flex flex-col gap-4 px-4 py-3">
    {showMonthNavigation ? <div data-testid="calendar-month-navigation" className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" className={headerButton} aria-label={previousMonthLabel} onClick={onPreviousMonth}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" /></button>
      <button type="button" className={`${headerButton} gap-1 px-3 whitespace-nowrap`} style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 500, color: 'var(--fg-1)' }}
        aria-label={t('calendar.monthPicker')} aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => { setYear(currentMonth.getFullYear()); setChoosingYear(false); setPickerOpen(true) }}>
        <span>{heading.month}{heading.year ? <> <span style={{ color: 'var(--fg-3)' }}>{heading.year}</span></> : null}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" className={headerButton} aria-label={nextMonthLabel} onClick={onNextMonth}><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></button>
    </div> : null}
    {viewSelector}
    {pickerOpen ? <Sheet ref={sheetRef} open title={t('calendar.monthPicker')} onClose={() => setPickerOpen(false)} virtualizedBody={choosingYear}
      actions={<PillButton size="sm" variant="ghost" onClick={() => closeSheet(() => { setPickerOpen(false); onCurrentMonth() })}>{t('calendar.thisMonth')}</PillButton>}>
      <CalendarMonthPicker currentMonth={currentMonth} onSelectMonth={chooseMonth} choosingYear={choosingYear} setChoosingYear={setChoosingYear} year={year} setYear={setYear} />
    </Sheet> : null}
  </div>
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

export function CalendarWeekNav({ weekLabel, previousWeekLabel, nextWeekLabel, currentWeekLabel, onPreviousWeek, onNextWeek, onCurrentWeek }: Readonly<CalendarWeekNavProps>) {
  return <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3">
    <button type="button" className={headerButton} aria-label={previousWeekLabel} onClick={onPreviousWeek}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" /></button>
    <button type="button" className={`${headerButton} px-3 whitespace-nowrap`} aria-label={currentWeekLabel} onClick={onCurrentWeek}>{weekLabel}</button>
    <button type="button" className={headerButton} aria-label={nextWeekLabel} onClick={onNextWeek}><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></button>
  </div>
}

interface CalendarLegendProps {
  loggableLabel: string
  fullLabel: string
  partialLabel: string
  noneLabel: string
}

export function CalendarLegend({
  loggableLabel,
  fullLabel,
  partialLabel,
  noneLabel,
}: Readonly<CalendarLegendProps>) {
  return (
    <div
      className="flex flex-col"
      style={{ gap: 16 }}
    >
      <LegendItem outcome="full" label={fullLabel} />
      <LegendItem outcome="partial" label={partialLabel} />
      <LegendItem outcome="none" label={noneLabel} />
      <LegendItem outcome="loggable" label={loggableLabel} />
    </div>
  )
}

interface LegendItemProps {
  outcome: 'full' | 'partial' | 'none' | 'loggable'
  label: string
}

function LegendSwatch({ outcome }: Readonly<Pick<LegendItemProps, 'outcome'>>) {
  if (outcome === 'partial') {
    return <span aria-hidden="true" data-legend-outcome="partial" className="shrink-0 rounded-full" style={{ width: 12, height: 12, borderWidth: 1.5, borderStyle: 'solid', borderTopColor: 'var(--primary)', borderRightColor: 'var(--primary)', borderBottomColor: 'var(--status-empty)', borderLeftColor: 'var(--status-empty)' }} />
  }

  const style = outcome === 'full'
    ? { background: 'var(--fg-1)' }
    : outcome === 'loggable'
      ? { background: 'var(--bg-well)', boxShadow: 'inset 0 0 0 2px var(--fg-3)' }
      : { boxShadow: 'inset 0 0 0 2px var(--status-empty)' }
  return <span aria-hidden="true" data-legend-outcome={outcome} className="rounded-full shrink-0" style={{ width: 12, height: 12, ...style }} />
}

function LegendItem({ outcome, label }: Readonly<LegendItemProps>) {
  return (
    <span className="inline-flex items-center" style={{ gap: 12 }}>
      <LegendSwatch outcome={outcome} />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          color: 'var(--fg-3)',
        }}
      >
        {label}
      </span>
    </span>
  )
}

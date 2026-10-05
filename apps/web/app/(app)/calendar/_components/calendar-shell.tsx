"use client"

import { useId, useRef, useState, type ReactNode } from 'react'
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
  periodNavigation?: ReactNode
  viewSelector?: ReactNode
}

const controlButton = 'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center border-0 text-[var(--fg-2)] cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]'
const titleButton = `${controlButton} rounded-[12px] bg-transparent`
const headerButton = `${controlButton} rounded-full bg-transparent shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]`
const pickerButton = `${controlButton} rounded-[12px] bg-[var(--bg-field)]`

function CalendarMonthPicker({ currentMonth, onSelectMonth, choosingYear, year, onSelectYear }: Readonly<Pick<CalendarHeaderProps, 'currentMonth' | 'onSelectMonth'> & { choosingYear: boolean; year: number; onSelectYear: (year: number) => void }>) {
  const locale = useLocale()
  return <div className="flex min-h-0 flex-col gap-4">
    {choosingYear ? <div className="flex min-h-0 flex-col"><YearPicker selectedYear={year} onSelectYear={onSelectYear} /></div> :
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6em), 1fr))' }}>
        {Array.from({ length: 12 }, (_, month) => <button key={month} type="button"
          className={`${pickerButton} px-2`} aria-pressed={month === currentMonth.getMonth() && year === currentMonth.getFullYear()}
          style={{ boxShadow: month === currentMonth.getMonth() && year === currentMonth.getFullYear() ? 'inset 0 0 0 2px var(--fg-1)' : undefined }}
          onClick={() => onSelectMonth(month, year)}>{formatLocaleDate(new Date(year, month, 1), locale, { month: 'short' })}</button>)}
      </div>}
  </div>
}

export function CalendarHeader({ currentMonth, todayKey, previousMonthLabel, nextMonthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, onSelectMonth, periodNavigation, viewSelector }: Readonly<CalendarHeaderProps>) {
  const pickerId = useId()
  const yearButtonRef = useRef<HTMLButtonElement>(null)
  const t = useTranslations()
  const locale = useLocale()
  const [year, setYear] = useState(currentMonth.getFullYear())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [choosingYear, setChoosingYear] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const heading = formatCalendarMonthHeading(currentMonth, todayKey, locale)
  const chooseMonth = (month: number, year: number) => closeSheet(() => { setPickerOpen(false); onSelectMonth(month, year) })
  return <div data-testid="calendar-header-group" className="flex flex-col gap-4 px-4 pt-3 pb-6">
    {!periodNavigation ? <div data-testid="calendar-month-navigation" className="flex min-h-12 flex-wrap items-center justify-center gap-2">
      <button type="button" className={headerButton} aria-label={previousMonthLabel} onClick={onPreviousMonth}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" /></button>
      <button type="button" className={`${titleButton} gap-1 px-3 whitespace-nowrap`} style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 500, color: 'var(--fg-1)' }}
        aria-label={`${heading.month}${heading.year ? ` ${heading.year}` : ''}, ${t('calendar.monthPicker')}`} aria-haspopup="dialog" aria-expanded={pickerOpen} aria-controls={pickerId} onClick={() => { setYear(currentMonth.getFullYear()); setChoosingYear(false); setPickerOpen(true) }}>
        <span>{heading.month}{heading.year ? <> <span style={{ color: 'var(--fg-2)' }}>{heading.year}</span></> : null}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" className={headerButton} aria-label={nextMonthLabel} onClick={onNextMonth}><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></button>
    </div> : null}
    {periodNavigation}
    {viewSelector}
    {pickerOpen ? <Sheet ref={sheetRef} open accessibleTitle={t('calendar.monthPicker')} onClose={() => setPickerOpen(false)} virtualizedBody={choosingYear}
      headerAccessory={<button ref={yearButtonRef} type="button" className={`${titleButton} px-3`} aria-label={`${year}, ${t('common.selectYear')}`} aria-expanded={choosingYear} aria-controls={pickerId} onClick={() => setChoosingYear(!choosingYear)}>{year}<ChevronDown size={16} strokeWidth={2} aria-hidden="true" /></button>}
      actions={<PillButton size="sm" variant="ghost" onClick={() => closeSheet(() => { setPickerOpen(false); onCurrentMonth() })}>{t('calendar.thisMonth')}</PillButton>}>
      <div id={pickerId} className="flex min-h-0 flex-col"><CalendarMonthPicker currentMonth={currentMonth} onSelectMonth={chooseMonth} choosingYear={choosingYear} year={year} onSelectYear={(nextYear) => { setYear(nextYear); setChoosingYear(false); yearButtonRef.current?.focus() }} /></div>
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
  return <div data-testid="calendar-week-navigation" className="flex min-h-12 flex-wrap items-center justify-center gap-2">
    <button type="button" className={headerButton} aria-label={previousWeekLabel} onClick={onPreviousWeek}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" /></button>
    <button type="button" className={`${titleButton} max-w-full px-3 py-2 text-center`} aria-label={`${weekLabel}, ${currentWeekLabel}`} onClick={onCurrentWeek}>{weekLabel}</button>
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
    return <span aria-hidden="true" data-legend-outcome="partial" className="shrink-0 rounded-full" style={{ width: 14, height: 14, borderWidth: 1.5, borderStyle: 'solid', borderTopColor: 'var(--primary)', borderRightColor: 'var(--primary)', borderBottomColor: 'var(--status-empty)', borderLeftColor: 'var(--status-empty)' }} />
  }

  const style = outcome === 'full'
    ? { background: 'var(--fg-1)' }
    : outcome === 'loggable'
      ? { background: 'var(--bg-well)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }
      : { boxShadow: 'inset 0 0 0 1.5px var(--status-empty)' }
  return <span aria-hidden="true" data-legend-outcome={outcome} className="rounded-full shrink-0" style={{ width: 14, height: 14, ...style }} />
}

function LegendItem({ outcome, label }: Readonly<LegendItemProps>) {
  return (
    <span className="inline-flex items-center" style={{ gap: 8 }}>
      <LegendSwatch outcome={outcome} />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '1rem',
          color: 'var(--fg-3)',
        }}
      >
        {label}
      </span>
    </span>
  )
}

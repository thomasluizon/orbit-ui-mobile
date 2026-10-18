"use client"

import type { CalendarHeaderNavigationProps } from '@orbit/shared/utils/calendar-navigation'

import { useId, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { YearPicker } from '@/components/ui/year-picker'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { formatCalendarMonthHeading, formatLocaleDate } from '@orbit/shared/utils'

interface CalendarHeaderProps extends CalendarHeaderNavigationProps {
  viewSelector?: ReactNode
}

const controlButton = 'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center border-0 text-[var(--fg-2)] cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]'
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

const monthTitleStyle = { padding: 'var(--orbit-space-8)', flexShrink: 0, maxWidth: '100%', fontFamily: 'var(--font-display)', fontSize: '1.375rem', lineHeight: 1.2, fontWeight: 500, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' } as const
const periodTitleStyle = { padding: 'var(--orbit-space-8) var(--orbit-space-16)', flexShrink: 1, maxWidth: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', lineHeight: 1.4, fontWeight: 400, color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' } as const

function CalendarNavigationTitle({ currentMonth, todayKey, isTodaySelected, period, pickerId, pickerOpen, onReturn, onOpenPicker }: Readonly<Pick<CalendarHeaderProps, 'currentMonth' | 'todayKey' | 'isTodaySelected' | 'period'> & { pickerId: string; pickerOpen: boolean; onReturn: () => void; onOpenPicker: () => void }>) {
  const t = useTranslations()
  const locale = useLocale()
  const heading = formatCalendarMonthHeading(currentMonth, todayKey, locale)
  const monthName = [heading.month, heading.year].filter(Boolean).join(' ')
  return <div className="flex max-w-full min-w-0 flex-wrap items-center justify-center">
        <button type="button" data-calendar-period-title={period ? '' : undefined} data-calendar-month-title={period ? undefined : ''}
          className={`${titleButton} transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:active:bg-transparent aria-disabled:focus-visible:bg-transparent ${period ? 'orbit-calendar-span-title' : ''}`}
          style={period ? periodTitleStyle : monthTitleStyle}
          aria-label={period ? t('calendar.period.goToCurrent', { period: period.label }) : `${monthName}, ${t('dates.goToToday')}`}
          aria-disabled={isTodaySelected} onClick={onReturn}>
          {period ? <span>{period.label}</span> : <span className="min-w-0 whitespace-normal break-words">{heading.month}{heading.year ? <> <span style={{ color: 'var(--fg-2)' }}>{heading.year}</span></> : null}</span>}
        </button>
        {!period ? <button type="button" className={titleButton} style={{ minWidth: 48, minHeight: 48 }}
          aria-label={`${monthName}, ${t('calendar.monthPicker')}`} aria-haspopup="dialog" aria-expanded={pickerOpen} aria-controls={pickerId}
          onClick={onOpenPicker}>
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </button> : null}
      </div>
}

export function CalendarHeader({ currentMonth, todayKey, isTodaySelected = false, previousMonthLabel, nextMonthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, onSelectMonth, period, viewSelector }: Readonly<CalendarHeaderProps>) {
  const pickerId = useId()
  const yearButtonRef = useRef<HTMLButtonElement>(null)
  const t = useTranslations()
  const [year, setYear] = useState(currentMonth.getFullYear())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [choosingYear, setChoosingYear] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const returnToToday = () => { if (!isTodaySelected) (period?.onCurrent ?? onCurrentMonth)() }
  const chooseMonth = (month: number, year: number) => closeSheet(() => { setPickerOpen(false); onSelectMonth(month, year) })
  return <div data-testid="calendar-header-group" className="flex flex-col gap-4 px-4 pt-3 pb-6">
    <div data-testid={period ? `calendar-${period.view === 'agenda' ? 'week' : period.view}-navigation` : 'calendar-month-navigation'} className={`flex min-h-12 flex-wrap items-center justify-center ${period ? 'gap-2' : 'gap-0'}`}>
      <button type="button" className={headerButton} aria-label={period?.previousLabel ?? previousMonthLabel} onClick={period?.onPrevious ?? onPreviousMonth}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" /></button>
      <CalendarNavigationTitle currentMonth={currentMonth} todayKey={todayKey} isTodaySelected={isTodaySelected} period={period}
        pickerId={pickerId} pickerOpen={pickerOpen} onReturn={returnToToday}
        onOpenPicker={() => { setYear(currentMonth.getFullYear()); setChoosingYear(false); setPickerOpen(true) }} />
      <button type="button" className={`${headerButton} disabled:opacity-40`} aria-label={period?.nextLabel ?? nextMonthLabel} onClick={period?.onNext ?? onNextMonth} disabled={period?.nextDisabled}><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></button>
    </div>
    {viewSelector}
    {pickerOpen ? <Sheet ref={sheetRef} open accessibleTitle={t('calendar.monthPicker')} onClose={() => setPickerOpen(false)} virtualizedBody={choosingYear}
      headerAccessory={<button ref={yearButtonRef} type="button" className={`${titleButton} px-3`} aria-label={`${year}, ${t('common.selectYear')}`} aria-expanded={choosingYear} aria-controls={pickerId} onClick={() => setChoosingYear(!choosingYear)}>{year}<ChevronDown size={16} strokeWidth={2} aria-hidden="true" /></button>}>
      <div id={pickerId} className="flex min-h-0 flex-col"><CalendarMonthPicker currentMonth={currentMonth} onSelectMonth={chooseMonth} choosingYear={choosingYear} year={year} onSelectYear={(nextYear) => { setYear(nextYear); setChoosingYear(false); yearButtonRef.current?.focus() }} /></div>
    </Sheet> : null}
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

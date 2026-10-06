import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

Element.prototype.scrollIntoView = vi.fn()

import {
  CalendarHeader,
  CalendarWeekNav,
  CalendarLegend,
} from '@/app/(app)/calendar/_components/calendar-shell'

describe('Calendar shell helpers', () => {
  it.each([
    [en, ['all logged', 'part done', 'nothing logged', 'can log'], 'Range', 'Open this day on Today', ['Previous range', 'Next range'], ['done', 'not logged', 'indulged', 'resisted']],
    [ptBR, ['tudo registrado', 'em parte', 'nada registrado', 'pode registrar'], 'Período', 'Abrir este dia no Hoje', ['Período anterior', 'Período seguinte'], ['feito', 'sem registro', 'cedeu', 'resistiu']],
  ])('uses the drawn calendar words in each locale', (locale, legendWords, rangeWord, dayLink, rangePager, statusWords) => {
    expect([locale.calendar.legend.full, locale.calendar.legend.partial, locale.calendar.legend.none, locale.calendar.legend.loggable]).toEqual(legendWords)
    expect([locale.calendar.dayCell.full, locale.calendar.dayCell.partial, locale.calendar.dayCell.none]).toEqual(legendWords.slice(0, 3))
    expect(locale.calendar.view.range).toBe(rangeWord)
    expect(locale.calendar.goToDay).toBe(dayLink)
    expect([locale.calendar.range.previous, locale.calendar.range.next]).toEqual(rangePager)
    expect([locale.calendar.status.completed, locale.calendar.status.missed, locale.calendar.status.indulged, locale.calendar.status.resisted]).toEqual(statusWords)
    render(<CalendarLegend loggableLabel={locale.calendar.legend.loggable} fullLabel={locale.calendar.legend.full} partialLabel={locale.calendar.legend.partial} noneLabel={locale.calendar.legend.none} />)
    for (const word of legendWords) expect(screen.getByText(word)).toBeInTheDocument()
  })

  it('renders the header, fires month handlers, and opens a year picker', () => {
    const onPreviousMonth = vi.fn()
    const onNextMonth = vi.fn()
    const onCurrentMonth = vi.fn()
    const onSelectYear = vi.fn()

    render(
      <CalendarHeader
        currentMonth={new Date(2026, 3, 1)}
        todayKey="2026-04-08"
        previousMonthLabel="common.previousMonth"
        nextMonthLabel="common.nextMonth"
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
        onCurrentMonth={onCurrentMonth}
        onSelectMonth={onSelectYear}
      />,
    )

    expect(screen.getByText('April')).toBeInTheDocument()
    expect(screen.queryByText('2026')).not.toBeInTheDocument()

    expect(screen.getByText('April').closest('button')).toHaveAttribute('aria-controls')
    expect(screen.getByText('April').closest('button')).toHaveAccessibleName('April, calendar.monthPicker')
    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByLabelText('April, calendar.monthPicker'))
    const pickerId = screen.getByLabelText('April, calendar.monthPicker').getAttribute('aria-controls')!
    expect(document.getElementById(pickerId)).toContainElement(screen.getByRole('button', { name: 'Apr' }))
    fireEvent.click(screen.getByText('calendar.thisMonth'))

    expect(onPreviousMonth).toHaveBeenCalledTimes(1)
    expect(onNextMonth).toHaveBeenCalledTimes(1)
    expect(onCurrentMonth).toHaveBeenCalledTimes(1)

    expect(screen.queryByLabelText('common.previousYear')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('common.nextYear')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('April, calendar.monthPicker'))
    expect(screen.getByRole('button', { name: 'Apr' })).toHaveStyle({ boxShadow: 'inset 0 0 0 2px var(--fg-1)' })
    const yearButton = screen.getByLabelText('2026, common.selectYear')
    fireEvent.click(yearButton)
    expect(document.getElementById(yearButton.getAttribute('aria-controls')!)).toContainElement(screen.getByRole('button', { name: '2030' }))
    fireEvent.click(screen.getByRole('button', { name: '2030' }))
    expect(screen.getByLabelText('2030, common.selectYear')).toBe(yearButton)
    expect(yearButton).toHaveFocus()
    expect(yearButton).toHaveAttribute('aria-expanded', 'false')
    expect(onSelectYear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apr' }))
    expect(onSelectYear).toHaveBeenCalledWith(3, 2030)
  })

  it('visibly identifies the selected month while browsing the picker', () => {
    render(<CalendarHeader currentMonth={new Date(2026, 3, 1)} todayKey="2026-04-08" previousMonthLabel="Previous" nextMonthLabel="Next" onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />)
    fireEvent.click(screen.getByText('April'))
    const selected = screen.getByRole('button', { name: 'Apr' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveStyle({ boxShadow: 'inset 0 0 0 2px var(--fg-1)' })
    expect(screen.getByRole('button', { name: 'May' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'May' })).not.toHaveStyle({ boxShadow: 'inset 0 0 0 2px var(--fg-1)' })
  })

  it('keeps the selector in the header without month controls in other views', () => {
    render(
      <CalendarHeader
        currentMonth={new Date(2026, 3, 1)}
        todayKey="2026-04-08"
        previousMonthLabel="Previous month"
        nextMonthLabel="Next month"
        onPreviousMonth={vi.fn()}
        onNextMonth={vi.fn()}
        onCurrentMonth={vi.fn()}
        onSelectMonth={vi.fn()}
        periodNavigation={<CalendarWeekNav weekLabel="Apr 6 to 12" previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} onCurrentWeek={vi.fn()} />}
        viewSelector={<div role="group" aria-label="Calendar views" />}
      />,
    )

    const header = screen.getByTestId('calendar-header-group')
    expect(header).toContainElement(screen.getByRole('group', { name: 'Calendar views' }))
    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select year' })).not.toBeInTheDocument()
  })

  it('renders the week nav and fires week handlers', () => {
    const onPreviousWeek = vi.fn()
    const onNextWeek = vi.fn()
    const onCurrentWeek = vi.fn()

    render(
      <CalendarWeekNav
        weekLabel="Jun 16 - 22"
        previousWeekLabel="common.previousWeek"
        nextWeekLabel="common.nextWeek"
        currentWeekLabel="calendar.goToCurrentWeek"
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
        onCurrentWeek={onCurrentWeek}
      />,
    )

    expect(screen.getByText('Jun 16 - 22')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.previousWeek'))
    fireEvent.click(screen.getByLabelText('common.nextWeek'))
    fireEvent.click(screen.getByLabelText('Jun 16 - 22, calendar.goToCurrentWeek'))

    expect(onPreviousWeek).toHaveBeenCalledTimes(1)
    expect(onNextWeek).toHaveBeenCalledTimes(1)
    expect(onCurrentWeek).toHaveBeenCalledTimes(1)
  })

  it('renders the calendar legend labels inline', () => {
    render(
      <CalendarLegend
        loggableLabel="Can log"
        fullLabel="All done"
        partialLabel="Partial"
        noneLabel="None logged"
      />,
    )

    expect(screen.getByText('Can log')).toBeInTheDocument()
    expect(screen.getByText('All done')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.getByText('None logged')).toBeInTheDocument()
    expect(document.querySelector('[data-legend-outcome="full"]')).toHaveStyle({ background: 'var(--fg-1)' })
    expect(document.querySelector('[data-legend-outcome="partial"]')?.getAttribute('style')).toContain('border-width: 1.5px')
    expect(document.querySelector('[data-legend-outcome="partial"]')?.getAttribute('style')).toContain('border-style: solid')
    expect(document.querySelector('[data-legend-outcome="partial"]')?.getAttribute('style')).toContain('border-bottom-color: var(--status-empty)')
    expect(document.querySelector('[data-legend-outcome="partial"]')?.getAttribute('style')).toContain('border-left-color: var(--status-empty)')
    expect(document.querySelector('[data-legend-outcome="partial"]')?.getAttribute('style')).toContain('border-top-color: var(--primary)')
    expect(document.querySelector('[data-legend-outcome="partial"]')?.getAttribute('style')).toContain('border-right-color: var(--primary)')
    expect(document.querySelector('[data-legend-outcome="none"]')).toHaveStyle({ background: '', boxShadow: 'inset 0 0 0 1.5px var(--status-empty)' })
    expect(document.querySelector('[data-legend-outcome="loggable"]')).toHaveStyle({
      background: 'var(--bg-well)',
      boxShadow: 'inset 0 0 0 1px var(--hairline)',
    })
    for (const outcome of ['full', 'partial', 'none', 'loggable']) {
      expect(document.querySelector(`[data-legend-outcome="${outcome}"]`)).toHaveStyle({ width: '14px', height: '14px' })
      expect(document.querySelector(`[data-legend-outcome="${outcome}"]`)?.parentElement).toHaveStyle({ gap: '8px' })
    }
  })
})

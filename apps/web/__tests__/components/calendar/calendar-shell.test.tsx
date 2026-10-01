import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
        monthLabel="April"
        year={2026}
        previousMonthLabel="common.previousMonth"
        nextMonthLabel="common.nextMonth"
        currentMonthLabel="calendar.goToCurrentMonth"
        selectYearLabel="common.selectYear"
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
        onCurrentMonth={onCurrentMonth}
        onSelectYear={onSelectYear}
      />,
    )

    expect(screen.getByText('April')).toBeInTheDocument()
    expect(screen.getByLabelText('common.selectYear')).toHaveStyle({ color: 'var(--fg-3)', fontWeight: 400 })

    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByLabelText('calendar.goToCurrentMonth'))

    expect(onPreviousMonth).toHaveBeenCalledTimes(1)
    expect(onNextMonth).toHaveBeenCalledTimes(1)
    expect(onCurrentMonth).toHaveBeenCalledTimes(1)

    expect(screen.queryByLabelText('common.previousYear')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('common.nextYear')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByRole('button', { name: '2030' }))
    expect(onSelectYear).toHaveBeenCalledWith(2030)
  })

  it('keeps the selector in the header without month controls in other views', () => {
    render(
      <CalendarHeader
        monthLabel="April"
        year={2026}
        previousMonthLabel="Previous month"
        nextMonthLabel="Next month"
        currentMonthLabel="Current month"
        selectYearLabel="Select year"
        onPreviousMonth={vi.fn()}
        onNextMonth={vi.fn()}
        onCurrentMonth={vi.fn()}
        onSelectYear={vi.fn()}
        showMonthNavigation={false}
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
    fireEvent.click(screen.getByLabelText('calendar.goToCurrentWeek'))

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
    expect(document.querySelector('[data-legend-outcome="none"]')).toHaveStyle({ boxShadow: 'inset 0 0 0 2px var(--status-empty)' })
    expect(document.querySelector('[data-legend-outcome="loggable"]')).toHaveStyle({
      background: 'var(--bg-well)',
      boxShadow: 'inset 0 0 0 1px var(--hairline)',
    })
  })
})

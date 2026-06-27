import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

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
        todayLabel="Today"
        doneLabel="Done"
        partialLabel="Partial"
        missedLabel="Missed"
      />,
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()
  })
})

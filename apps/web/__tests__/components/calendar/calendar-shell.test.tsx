import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import {
  CalendarHeader,
  CalendarWeekNav,
  CalendarLegend,
} from '@/app/(app)/calendar/_components/calendar-shell'

describe('Calendar shell helpers', () => {
  it('renders the calendar header actions including year jumps', () => {
    const onPreviousMonth = vi.fn()
    const onNextMonth = vi.fn()
    const onPreviousYear = vi.fn()
    const onNextYear = vi.fn()
    const onCurrentMonth = vi.fn()

    render(
      <CalendarHeader
        monthLabel="April 2026"
        previousMonthLabel="common.previousMonth"
        nextMonthLabel="common.nextMonth"
        previousYearLabel="common.previousYear"
        nextYearLabel="common.nextYear"
        currentMonthLabel="calendar.goToCurrentMonth"
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
        onPreviousYear={onPreviousYear}
        onNextYear={onNextYear}
        onCurrentMonth={onCurrentMonth}
      />,
    )

    expect(screen.getByText('April 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByLabelText('common.previousYear'))
    fireEvent.click(screen.getByLabelText('common.nextYear'))
    fireEvent.click(screen.getByLabelText('calendar.goToCurrentMonth'))

    expect(onPreviousMonth).toHaveBeenCalledTimes(1)
    expect(onNextMonth).toHaveBeenCalledTimes(1)
    expect(onPreviousYear).toHaveBeenCalledTimes(1)
    expect(onNextYear).toHaveBeenCalledTimes(1)
    expect(onCurrentMonth).toHaveBeenCalledTimes(1)
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

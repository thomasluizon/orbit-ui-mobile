import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import {
  CalendarHeader,
  CalendarLegend,
} from '@/app/(app)/calendar/_components/calendar-shell'

describe('Calendar shell helpers', () => {
  it('renders the calendar header actions', () => {
    const onGoToToday = vi.fn()
    const onPreviousMonth = vi.fn()
    const onNextMonth = vi.fn()

    render(
      <CalendarHeader
        title="nav.calendar"
        monthLabel="April 2026"
        goToTodayLabel="dates.goToToday"
        previousMonthLabel="common.previousMonth"
        nextMonthLabel="common.nextMonth"
        onGoToToday={onGoToToday}
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
      />,
    )

    expect(screen.getByText('nav.calendar')).toBeInTheDocument()
    expect(screen.getByText('April 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('dates.goToToday'))
    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))

    expect(onGoToToday).toHaveBeenCalledTimes(1)
    expect(onPreviousMonth).toHaveBeenCalledTimes(1)
    expect(onNextMonth).toHaveBeenCalledTimes(1)
  })

  it('renders the calendar legend labels', () => {
    render(
      <CalendarLegend
        doneLabel="Done"
        upcomingLabel="Upcoming"
        missedLabel="Missed"
      />,
    )

    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import {
  CalendarHeader,
  CalendarLegend,
} from '@/app/(app)/calendar/_components/calendar-shell'

describe('Calendar shell helpers', () => {
  it('renders the calendar header actions', () => {
    const onPreviousMonth = vi.fn()
    const onNextMonth = vi.fn()

    render(
      <CalendarHeader
        title="nav.calendar"
        monthLabel="April 2026"
        previousMonthLabel="common.previousMonth"
        nextMonthLabel="common.nextMonth"
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
      />,
    )

    expect(screen.getByText('nav.calendar')).toBeInTheDocument()
    expect(screen.getByText('April 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))

    expect(onPreviousMonth).toHaveBeenCalledTimes(1)
    expect(onNextMonth).toHaveBeenCalledTimes(1)
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

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'

function entry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: 'habit-1',
    title: 'Morning walk',
    status: 'upcoming',
    isBadHabit: false,
    dueTime: '08:00',
    isOneTime: false,
    ...overrides,
  }
}

const startDate = new Date(2026, 8, 12)
const dayMap = new Map<string, CalendarDayEntry[]>([
  [formatAPIDate(startDate), [entry()]],
])

function renderAgenda(isLoading = false) {
  return render(
    <CalendarAgendaView
      startDate={startDate}
      dayMap={dayMap}
      displayTime={(time) => time}
      displayWeekdayDate={(date) => `Day ${date.getDate()}`}
      todayKey={formatAPIDate(startDate)}
      isLoading={isLoading}
      loadingLabel="common.loading"
    />,
  )
}

describe('CalendarAgendaView', () => {
  it('lists seven days ahead with empty days preserved', () => {
    renderAgenda()

    expect(screen.getAllByTestId('calendar-agenda-day')).toHaveLength(7)
    expect(screen.getByText('calendar.agenda.today, Day 12')).toBeDefined()
    expect(screen.getByText('Morning walk')).toBeDefined()
    expect(screen.getAllByText('calendar.agenda.empty')).toHaveLength(6)
  })

  it('renders agenda habits as read-only rows without a press handler', () => {
    renderAgenda()

    expect(screen.getByText('Morning walk')).toBeDefined()
    expect(screen.getByText('Morning walk')).toHaveClass('break-words')
    expect(screen.getByText('Morning walk')).not.toHaveClass('truncate')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a shaped placeholder instead of definitive empty days while loading', () => {
    renderAgenda(true)

    expect(screen.getAllByTestId('calendar-agenda-loading-day')).toHaveLength(7)
    expect(screen.getByRole('progressbar', { name: 'common.loading' })).toBeDefined()
    expect(screen.queryByText('calendar.agenda.empty')).toBeNull()
  })
})

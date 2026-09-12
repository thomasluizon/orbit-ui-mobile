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

function renderAgenda() {
  return render(
    <CalendarAgendaView
      startDate={startDate}
      dayMap={dayMap}
      displayTime={(time) => time}
      displayWeekdayDate={(date) => `Day ${date.getDate()}`}
    />,
  )
}

describe('CalendarAgendaView', () => {
  it('lists seven days ahead with empty days preserved', () => {
    renderAgenda()

    expect(screen.getAllByTestId('calendar-agenda-day')).toHaveLength(7)
    expect(screen.getByText('Morning walk')).toBeDefined()
    expect(screen.getAllByText('calendar.agenda.empty')).toHaveLength(6)
  })

  it('renders agenda habits as read-only rows without a press handler', () => {
    renderAgenda()

    expect(screen.getByText('Morning walk')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

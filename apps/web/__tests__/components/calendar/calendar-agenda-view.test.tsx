import { personalText } from '@/__tests__/support/personal-text'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { buildCalendarDayMap, formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => key === 'calendar.agenda.timedEntryLabel'
    ? `${params?.title}, ${params?.time}`
    : key,
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
    expect(screen.getByText(personalText('calendar.agenda.today, Day 12'))).toBeDefined()
    expect(screen.getByText(personalText('Morning walk'))).toBeDefined()
    expect(screen.getAllByText('calendar.agenda.empty')).toHaveLength(6)
  })

  it('discloses a full name from a row with metadata beneath the title', () => {
    renderAgenda()
    const row = screen.getByRole('button', { name: /Morning walk/ })
    expect(row).toHaveAccessibleName('Morning walk, 08:00')
    expect(row.querySelector('[data-slot="list-row-value"]')).toBeNull()
    fireEvent.click(row)
    expect(screen.getByRole('dialog')).toHaveTextContent('Morning walk')
  })

  it('announces the full clamped title and the formatted scheduled time before disclosure', () => {
    const title = 'Morning walk with every preparation step and the complete destination '.repeat(8).trim()
    render(<CalendarAgendaView startDate={startDate} dayMap={new Map([[formatAPIDate(startDate), [entry({ title })]]])}
      displayTime={() => '8:00 AM'} displayWeekdayDate={(date) => `Day ${date.getDate()}`}
      todayKey={formatAPIDate(startDate)} isLoading={false} loadingLabel="common.loading" />)
    expect(screen.getByRole('button', { name: `${title}, 8:00 AM` })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a shaped placeholder instead of definitive empty days while loading', () => {
    renderAgenda(true)

    expect(screen.getAllByTestId('calendar-agenda-loading-day')).toHaveLength(7)
    expect(screen.getByRole('progressbar', { name: 'common.loading' })).toBeDefined()
    expect(screen.queryByText('calendar.agenda.empty')).toBeNull()
  })
})


describe('CalendarAgendaView sub-habit carry', () => {
  it('keeps a logged sub-habit read-only and displays its own title and time', () => {
    const day = formatAPIDate(startDate)
    const entries = buildCalendarDayMap({ habits: [createMockHabitScheduleItem({
      id: 'parent',
      children: [createMockHabitScheduleChild({
        id: 'child', title: 'Stretch', dueTime: '18:00', dueEndTime: '18:30',
        instances: [{ date: day, status: 'Completed', logId: 'child-log' }],
      })],
    })], logs: {} }, { from: day, to: day })
    render(<CalendarAgendaView startDate={startDate} dayMap={entries}
      displayTime={(time) => time} displayWeekdayDate={(date) => `Day ${date.getDate()}`}
      todayKey={day} isLoading={false} loadingLabel="common.loading" />)
    expect(screen.getByText('Stretch')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stretch/ })).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
  })
})

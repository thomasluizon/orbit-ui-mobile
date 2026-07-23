import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarSyncEventRow } from '@/app/(app)/calendar-sync/_components/calendar-sync-event-row'
import type { CalendarSyncEvent } from '@orbit/shared'

vi.mock('@orbit/shared/utils', () => ({
  formatCalendarSyncRecurrenceLabel: () => 'Daily',
}))

const translate = ((key: string) => key) as unknown as Parameters<
  typeof CalendarSyncEventRow
>[0]['t']

function makeEvent(overrides: Partial<CalendarSyncEvent> = {}): CalendarSyncEvent {
  return {
    id: 'e1',
    title: 'Morning Workout',
    description: null,
    startDate: '2025-06-01',
    startTime: '08:00',
    endTime: '09:00',
    isRecurring: false,
    recurrenceRule: null,
    reminders: [],
    calendarName: null,
    ...overrides,
  } as CalendarSyncEvent
}

function renderRow(event: CalendarSyncEvent, onToggle = vi.fn()) {
  return render(
    <CalendarSyncEventRow
      event={event}
      selected={false}
      isReviewMode={false}
      suggestionId={null}
      dismissPending={false}
      onToggle={onToggle}
      onDismiss={vi.fn()}
      t={translate}
    />,
  )
}

describe('CalendarSyncEventRow', () => {
  it('renders the date and the time range as one meta string', () => {
    renderRow(makeEvent())
    expect(screen.getByText('2025-06-01 · 08:00 - 09:00')).toBeInTheDocument()
  })

  it('drops the separator when the event carries only a date', () => {
    renderRow(makeEvent({ startTime: null, endTime: null }))
    expect(screen.getByText('2025-06-01')).toBeInTheDocument()
  })

  it('omits the open end time from the range', () => {
    renderRow(makeEvent({ endTime: null }))
    expect(screen.getByText('2025-06-01 · 08:00')).toBeInTheDocument()
  })

  it('renders no meta line at all when the event has no date or time', () => {
    const { container } = renderRow(makeEvent({ startDate: null, startTime: null, endTime: null }))
    expect(container.querySelectorAll('.t-meta')).toHaveLength(0)
  })

  it('draws no rule of its own, so the list container owns separation', () => {
    const { container } = renderRow(makeEvent())
    const row = container.firstElementChild as HTMLElement
    expect(row.style.borderBottom).toBe('')
  })

  it('toggles the event when the row is pressed', () => {
    const onToggle = vi.fn()
    renderRow(makeEvent(), onToggle)
    fireEvent.click(screen.getByRole('button', { name: /Morning Workout/ }))
    expect(onToggle).toHaveBeenCalledWith('e1')
  })
})

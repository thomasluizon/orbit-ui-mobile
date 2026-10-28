import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { buildCalendarDayMap } from '@orbit/shared/utils'
import { CalendarOptions } from '@/app/(app)/calendar/_components/calendar-options'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/shell/destination-shell', () => ({ useShellHeaderSlot: () => false }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
const shell = vi.hoisted(() => ({ wide: false }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => shell.wide }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { done: number; total: number }) => values && key === 'calendar.dayDetail.completionSummary' ? `${values.done} of ${values.total}` : key, useLocale: () => 'en' }))

beforeEach(() => {
  shell.wide = false
  useUIStore.setState({ calendarShowRecurring: true })
  sheetTestControls.defer(false)
})
afterEach(() => sheetTestControls.defer(false))

function openOptions() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'calendar.options' }), { button: 0, ctrlKey: false })
  return screen.getByRole('dialog', { name: 'calendar.options' })
}

describe('compact Calendar options', () => {
  it('uses a checkbox row and two list rows', () => {
    render(<CalendarOptions onGoogleCalendar={vi.fn()} />)
    const dialog = openOptions()
    expect(within(dialog).getByRole('checkbox', { name: 'calendar.showRecurring' })).toHaveAttribute('aria-checked', 'true')
    for (const label of ['calendar.googleCalendar', 'calendar.legendTitle']) {
      const row = within(dialog).getByRole('button', { name: label })
      expect(row.querySelector('[data-slot="list-row-title"]')).toHaveTextContent(label)
    }
  })

  it('changes the filter only after the sheet closes', () => {
    sheetTestControls.defer(true)
    render(<CalendarOptions />)
    const dialog = openOptions()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'calendar.showRecurring' }))
    expect(useUIStore.getState().calendarShowRecurring).toBe(true)
    sheetTestControls.completeDismissal()
    expect(useUIStore.getState().calendarShowRecurring).toBe(false)
  })

  it('opens Google Calendar only after dismissal and keeps an unavailable action disabled', () => {
    sheetTestControls.defer(true)
    const onGoogleCalendar = vi.fn()
    render(<CalendarOptions onGoogleCalendar={onGoogleCalendar} />)
    fireEvent.click(within(openOptions()).getByRole('button', { name: 'calendar.googleCalendar' }))
    expect(onGoogleCalendar).not.toHaveBeenCalled()
    sheetTestControls.completeDismissal()
    expect(onGoogleCalendar).toHaveBeenCalledOnce()
  })

  it('rejects an unavailable Google Calendar action and opens the legend', () => {
    render(<CalendarOptions />)
    const dialog = openOptions()
    const google = within(dialog).getByRole('button', { name: 'calendar.googleCalendar' })
    expect(google).toBeDisabled()
    fireEvent.click(google)
    expect(dialog).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'calendar.legendTitle' }))
    expect(screen.queryByRole('dialog', { name: 'calendar.options' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'calendar.legendTitle' })).toHaveTextContent('calendar.legend.loggable')
  })
})

function DayWithOptions() {
  const showRecurring = useUIStore(state => state.calendarShowRecurring)
  const date = '2026-09-12'
  const entries = buildCalendarDayMap({ habits: [
    createMockHabitScheduleItem({ id: 'repeat', title: 'Read', scheduledDates: [date], instances: [] }),
    createMockHabitScheduleItem({ id: 'task', title: 'Appointment', frequencyUnit: null, scheduledDates: [date], instances: [] }),
  ], logs: { task: [{ id: 'log', date, value: 1, createdAtUtc: `${date}T12:00:00Z` }] } }, { from: date, to: date }).get(date)!
  return <><CalendarOptions /><CalendarDayDetail dateStr={date} today={date} entries={entries}
    calendarEvents={[]} calendarEventsState="ready" onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()}
    onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} loggable={false} showRecurring={showRecurring}
    pendingEntryStates={new Map()} onEntryChange={() => null} /></>
}

it('keeps the day switch, visible rows, count and Options checkbox in sync in both directions', () => {
  render(<DayWithOptions />)
  const summary = () => document.querySelector('section p')!
  expect(screen.getByRole('button', { name: /^Read,/ })).toBeInTheDocument()
  expect(summary()).toHaveTextContent('1 of 2')
  fireEvent.click(screen.getByRole('switch', { name: 'calendar.showRecurringShort' }))
  expect(useUIStore.getState().calendarShowRecurring).toBe(false)
  expect(summary()).toHaveTextContent('1 of 1')
  expect(screen.queryByRole('button', { name: /^Read,/ })).toBeNull()
  expect(screen.getByRole('button', { name: /^Appointment,/ })).toBeInTheDocument()
  const dialog = openOptions()
  const checkbox = within(dialog).getByRole('checkbox', { name: 'calendar.showRecurring' })
  expect(checkbox).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(checkbox)
  expect(useUIStore.getState().calendarShowRecurring).toBe(true)
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  expect(summary()).toHaveTextContent('1 of 2')
  expect(screen.getByRole('button', { name: /^Read,/ })).toBeInTheDocument()
})

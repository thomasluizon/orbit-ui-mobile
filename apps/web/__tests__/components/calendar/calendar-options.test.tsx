import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarOptions } from '@/app/(app)/calendar/_components/calendar-options'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { useUIStore } from '@/stores/ui-store'

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/shell/destination-shell', () => ({ useShellHeaderSlot: () => false }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
const shell = vi.hoisted(() => ({ wide: false }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => shell.wide }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))

beforeEach(() => {
  shell.wide = false
  useUIStore.setState({ calendarShowRecurring: true })
  sheetTestControls.defer(false)
})
afterEach(() => sheetTestControls.defer(false))

function openOptions() {
  fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))
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

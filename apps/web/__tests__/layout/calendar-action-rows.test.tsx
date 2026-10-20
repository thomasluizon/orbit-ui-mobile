import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { filterCalendarSyncEventsByDate } from '@orbit/shared/utils'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount } from '@/__tests__/support/account-change'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { marketingEmailConsent: null } }),
}))
vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

const day = '2026-09-04'
const events = [
  createMockCalendarSyncEvent({ title: 'Team meeting', startDate: day, startTime: '09:00', isImported: false }),
  createMockCalendarSyncEvent({ id: 'event-2', title: 'Planning', startDate: day, startTime: '13:00' }),
  createMockCalendarSyncEvent({ id: 'event-3', title: 'Review', startDate: day, startTime: '16:00' }),
]

beforeEach(() => {
  holdAccount('calendar-action-rows')
  useReferralPromptStore.setState(useReferralPromptStore.getInitialState())
  useUIStore.setState(useUIStore.getInitialState())
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${day}T12:00:00Z`))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('calendar action rows with delayed marketing consent', () => {
  it('keeps every event actionable after consent interrupts the row inspection', async () => {
    const client = new QueryClient()
    const onOpenCalendarImport = vi.fn()
    render(<QueryClientProvider client={client}>
      <CalendarDayDetail dateStr={day} today={day} entries={[]}
        calendarEvents={filterCalendarSyncEventsByDate(events, day)} showEventSource={false}
        calendarEventsState="ready" onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()}
        onOpenCalendarImport={onOpenCalendarImport} onViewPro={vi.fn()}
        loggable={false} showRecurring pendingEntryStates={new Map()} onEntryChange={async () => {}} />
      <MarketingConsentPrompt />
    </QueryClientProvider>)
    const card = screen.getByRole('region')
    expect(within(card).getByRole('button', { name: '09:00, Team meeting' })).toBeVisible()
    await act(async () => {
      useReferralPromptStore.getState().armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    vi.useRealTimers()
    const consent = screen.getByRole('dialog', { name: 'marketingConsent.prompt.title' })
    expect(consent).toBeVisible()
    expect(within(card).getByText('Planning', { exact: true })).toBeVisible()
    expect(within(card).queryByRole('button', { name: '13:00, Planning' })).toBeNull()
    fireEvent.click(within(consent).getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(card).getByRole('button', { name: '13:00, Planning' })).toBeVisible()

    for (const event of events) {
      const row = within(card).getByRole('button', { name: `${event.startTime}, ${event.title}` })
      expect(row).toBeVisible()
      expect(row).not.toHaveClass('orbit-pill-action')
      expect(row).not.toHaveAttribute('data-size')
      expect(within(row).queryByRole('button')).toBeNull()
      fireEvent.click(row)
      expect(onOpenCalendarImport).toHaveBeenLastCalledWith(event.id)
    }
    client.clear()
  })
})

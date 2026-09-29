import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'
import ProfilePage from '@/app/(app)/profile/page'
import CalendarPage from '@/app/(app)/calendar/page'
import { RenderedAccountSeed } from '@/app/(app)/rendered-account-seed'
import { getQueryClient } from '@/lib/query-client'
import { respondWithAccount, retireHeldAccount } from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'

const fetchJson = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-fetch')>(),
  fetchJson,
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ syncThemeFromProfile: vi.fn(), detectAndSaveThemeIfNeeded: vi.fn() }),
}))
vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))
vi.mock('@/app/(app)/profile/_components/profile-settings-content', () => ({
  ProfileSettingsContent: ({ isLoading }: { isLoading: boolean }) =>
    <div data-testid="profile-state">{isLoading ? 'profile.loading' : 'profile.ready'}</div>,
}))
vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarData: () => ({ dayMap: new Map(), isLoading: false, isFetching: false, error: null, refresh: vi.fn() }),
  useCalendarRange: () => ({ dayMap: new Map(), isLoading: false, isFetching: false, error: null, refresh: vi.fn() }),
}))
vi.mock('@/hooks/use-calendar-events', () => ({
  useCalendarEvents: () => ({ data: undefined, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: undefined }),
  useSetCalendarAutoSync: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: vi.fn() }) }))
vi.mock('@/hooks/use-date-format', () => ({ useDateFormat: () => ({ displayWeekdayDate: vi.fn() }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-08-29' }))
vi.mock('@/components/ui/sheet', () => ({ Sheet: () => null, useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: vi.fn() }) }))
vi.mock('@/components/calendar/calendar-grid', () => ({
  CalendarGrid: ({ isLoading }: { isLoading: boolean }) =>
    <div data-testid="calendar-grid">{isLoading ? 'calendar.loading' : 'calendar.ready'}</div>,
}))
vi.mock('@/app/(app)/calendar/_components/calendar-shell', () => ({ CalendarHeader: () => null, CalendarLegend: () => null }))
vi.mock('@/components/calendar/calendar-stats', () => ({ CalendarStats: () => null }))
vi.mock('@/components/calendar/calendar-day-detail', () => ({ CalendarDayDetail: () => null }))
vi.mock('@/components/calendar/calendar-week-view', () => ({ CalendarWeekView: () => null }))
vi.mock('@/components/calendar/calendar-range-view', () => ({ CalendarRangeView: () => null }))
vi.mock('@/components/calendar/calendar-agenda-view', () => ({ CalendarAgendaView: () => null }))
vi.mock('@/components/calendar/calendar-load-error', () => ({ CalendarLoadError: () => null }))
vi.mock('@/components/calendar/show-recurring-toggle', () => ({ ShowRecurringToggle: () => null }))
vi.mock('@/components/ui/segmented-control', () => ({ SegmentedControl: () => null }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }))

function renderPage(page: React.ReactNode) {
  return render(
    <QueryClientProvider client={getQueryClient()}>
      <RenderedAccountSeed accountId="user-1">{page}</RenderedAccountSeed>
    </QueryClientProvider>,
  )
}

async function holdProfileRequest() {
  await retireHeldAccount()
  getQueryClient().clear()
  let answer!: (profile: Profile) => void
  const pending = new Promise<Profile>((resolve) => { answer = resolve })
  fetchJson.mockReturnValue(pending)
  return answer
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  fetchJson.mockReset()
})
afterEach(() => {
  getQueryClient().clear()
  vi.unstubAllGlobals()
})

describe('pages with a profile request held across the first account check', () => {
  it('lets ProfilePage leave loading when its request answers', async () => {
    const answer = await holdProfileRequest()
    renderPage(<ProfilePage />)
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    expect(screen.getByTestId('profile-state')).toHaveTextContent('profile.loading')

    respondWithAccount('user-1')
    await act(async () => { await useAuthStore.getState().checkSession() })
    await act(async () => answer(createMockProfile()))

    await waitFor(() => expect(screen.getByTestId('profile-state')).toHaveTextContent('profile.ready'))
  })

  it('lets CalendarPage leave its profile grid skeleton when the request answers', async () => {
    const answer = await holdProfileRequest()
    renderPage(<CalendarPage />)
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    expect(screen.getByTestId('calendar-grid')).toHaveTextContent('calendar.loading')

    respondWithAccount('user-1')
    await act(async () => { await useAuthStore.getState().checkSession() })
    await act(async () => answer(createMockProfile()))

    await waitFor(() => expect(screen.getByTestId('calendar-grid')).toHaveTextContent('calendar.ready'))
  })
})

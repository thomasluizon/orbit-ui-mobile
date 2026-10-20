import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

import { usePreferenceControls } from '@/app/use-preference-controls'
import { useCalendarEvents } from '@/hooks/use-calendar-events'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  profile: { timeZone: 'UTC' } as Profile,
  patchProfile: vi.fn(),
  performQueuedApiMutation: vi.fn(),
  apiClient: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, patchProfile: mocks.patchProfile }),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    applyTheme: vi.fn(),
    currentTheme: 'dark',
    currentScheme: 'dark',
  }),
}))

function calendarEvent(startDate: string) {
  return {
    id: 'meeting',
    title: 'Meeting',
    description: null,
    startDate,
    startTime: '00:30',
    endTime: '01:00',
    isRecurring: false,
    recurrenceRule: null,
    reminders: [],
  }
}

describe('mobile timezone calendar cache settlement', () => {
  beforeEach(() => {
    mocks.profile = { timeZone: 'UTC' } as Profile
    mocks.patchProfile.mockReset()
    mocks.performQueuedApiMutation.mockReset()
    mocks.apiClient.mockReset()
  })

  it('refetches every calendar event timezone after the timezone write settles', async () => {
    let settleTimezoneWrite!: () => void
    mocks.performQueuedApiMutation.mockReturnValue(
      new Promise((resolve) => {
        settleTimezoneWrite = () => resolve(undefined)
      }),
    )
    mocks.patchProfile.mockImplementation((patch: Partial<Profile>) => {
      mocks.profile = { ...mocks.profile, ...patch }
    })
    let resolveOptimisticRequest!: (events: ReturnType<typeof calendarEvent>[]) => void
    mocks.apiClient
      .mockResolvedValueOnce([calendarEvent('2026-09-13')])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOptimisticRequest = resolve
        }),
      )
      .mockResolvedValueOnce([calendarEvent('2026-09-12')])
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    let current!: {
      controls: ReturnType<typeof usePreferenceControls>
      events: ReturnType<typeof useCalendarEvents>
    }
    function Harness() {
      current = {
        controls: usePreferenceControls(),
        events: useCalendarEvents({ timeZone: mocks.profile.timeZone }),
      }
      return null
    }
    let root!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      )
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(current.events.data?.status).toBe('connected'))

    await TestRenderer.act(async () => {
      current.controls.timeZoneMutation.mutate('America/Los_Angeles')
      await Promise.resolve()
    })
    expect(mocks.profile.timeZone).toBe('America/Los_Angeles')
    await TestRenderer.act(async () => {
      root.update(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      )
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(mocks.apiClient).toHaveBeenCalledTimes(2))

    settleTimezoneWrite()

    await vi.waitFor(() => expect(mocks.apiClient).toHaveBeenCalledTimes(3))
    await TestRenderer.act(async () => {
      resolveOptimisticRequest([calendarEvent('2026-09-13')])
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(current.events.data).toEqual({
      status: 'connected',
      events: [calendarEvent('2026-09-12')],
    }))
    expect(
      queryClient.getQueryState([...calendarKeys.all, 'manual-fetch', 'UTC'])?.isInvalidated,
    ).toBe(true)
  })
})

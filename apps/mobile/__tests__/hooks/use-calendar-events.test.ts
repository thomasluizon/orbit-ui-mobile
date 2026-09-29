import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKeys } from '@orbit/shared/query'
import type { CalendarSyncEvent } from '@orbit/shared'

import {
  useCalendarEvents,
  type CalendarEventsResult,
} from '@/hooks/use-calendar-events'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(async () => {}),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  })),
  apiClient: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

function buildEvent(id: string): CalendarSyncEvent {
  return {
    id,
    title: `Event ${id}`,
    description: null,
    startDate: '2025-01-01',
    startTime: null,
    endTime: null,
    isRecurring: false,
    recurrenceRule: null,
    reminders: [],
  }
}

function useCapturedQueryFn(): () => Promise<CalendarEventsResult> {
  let captured: (() => Promise<CalendarEventsResult>) | null = null
  mocks.useQuery.mockImplementation(
    (config: { queryFn: () => Promise<CalendarEventsResult> }) => {
      captured = config.queryFn
      return { data: undefined }
    },
  )
  useCalendarEvents({ timeZone: 'UTC' })
  return captured!
}

describe('mobile useCalendarEvents', () => {
  beforeEach(() => {
    mocks.useQuery.mockReset()
    mocks.apiClient.mockReset()
  })

  it('separates cached event projections by account timezone', () => {
    mocks.useQuery.mockReturnValue({ data: undefined })
    useCalendarEvents({ timeZone: 'UTC' })
    useCalendarEvents({ timeZone: 'America/Los_Angeles' })

    expect(mocks.useQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        queryKey: [...calendarKeys.all, 'manual-fetch', 'UTC'],
        retry: false,
      }),
    )
    expect(mocks.useQuery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        queryKey: [...calendarKeys.all, 'manual-fetch', 'America/Los_Angeles'],
      }),
    )
  })

  it('returns a connected result with the fetched events', async () => {
    const queryFn = useCapturedQueryFn()
    const events = [
      { ...buildEvent('a'), isImported: true, importedHabitId: '4a16a8be-cd9b-4baf-bcaf-ec0ce6d59dfa' },
      { ...buildEvent('b'), isImported: false },
    ]
    mocks.apiClient.mockResolvedValue(events)

    const result = await queryFn()

    expect(result).toEqual({
      status: 'connected',
      events,
    })
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/calendar/events?includeImported=true')
  })

  it('coerces a non-array payload to an empty connected list', async () => {
    const queryFn = useCapturedQueryFn()
    mocks.apiClient.mockResolvedValue(null)

    const result = await queryFn()

    expect(result).toEqual({ status: 'connected', events: [] })
  })

  it('maps a not-connected error to the not-connected status', async () => {
    const queryFn = useCapturedQueryFn()
    mocks.apiClient.mockRejectedValue(new Error('Google Calendar is not connected'))

    const result = await queryFn()

    expect(result).toEqual({ status: 'not-connected' })
  })

  it('maps an Unauthorized error to the not-connected status', async () => {
    const queryFn = useCapturedQueryFn()
    mocks.apiClient.mockRejectedValue(new Error('Unauthorized'))

    const result = await queryFn()

    expect(result).toEqual({ status: 'not-connected' })
  })

  it('rethrows unrelated network errors so the query surfaces them', async () => {
    const queryFn = useCapturedQueryFn()
    mocks.apiClient.mockRejectedValue(new Error('Internal server error'))

    await expect(queryFn()).rejects.toThrow('Internal server error')
  })
})

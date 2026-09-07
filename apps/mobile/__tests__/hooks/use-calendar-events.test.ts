import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKeys } from '@orbit/shared/query'
import type { CalendarSyncEvent } from '@orbit/shared'

import {
  useCalendarEvents,
  type CalendarEventsResult,
} from '@/hooks/use-calendar-events'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  apiClient: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
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

function captureQueryFn(): () => Promise<CalendarEventsResult> {
  let captured: (() => Promise<CalendarEventsResult>) | null = null
  mocks.useQuery.mockImplementation(
    (config: { queryFn: () => Promise<CalendarEventsResult> }) => {
      captured = config.queryFn
      return { data: undefined }
    },
  )
  useCalendarEvents()
  return captured!
}

describe('mobile useCalendarEvents', () => {
  beforeEach(() => {
    mocks.useQuery.mockReset()
    mocks.apiClient.mockReset()
  })

  it('registers the shared manual-fetch query key with retry disabled', () => {
    mocks.useQuery.mockReturnValue({ data: undefined })
    useCalendarEvents()

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [...calendarKeys.all, 'manual-fetch'],
        retry: false,
      }),
    )
  })

  it('returns a connected result with the fetched events', async () => {
    const queryFn = captureQueryFn()
    mocks.apiClient.mockResolvedValue([buildEvent('a'), buildEvent('b')])

    const result = await queryFn()

    expect(result).toEqual({
      status: 'connected',
      events: [buildEvent('a'), buildEvent('b')],
    })
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/calendar/events')
  })

  it('coerces a non-array payload to an empty connected list', async () => {
    const queryFn = captureQueryFn()
    mocks.apiClient.mockResolvedValue(null)

    const result = await queryFn()

    expect(result).toEqual({ status: 'connected', events: [] })
  })

  it('maps a not-connected error to the not-connected status', async () => {
    const queryFn = captureQueryFn()
    mocks.apiClient.mockRejectedValue(new Error('Google Calendar is not connected'))

    const result = await queryFn()

    expect(result).toEqual({ status: 'not-connected' })
  })

  it('maps an Unauthorized error to the not-connected status', async () => {
    const queryFn = captureQueryFn()
    mocks.apiClient.mockRejectedValue(new Error('Unauthorized'))

    const result = await queryFn()

    expect(result).toEqual({ status: 'not-connected' })
  })

  it('rethrows unrelated network errors so the query surfaces them', async () => {
    const queryFn = captureQueryFn()
    mocks.apiClient.mockRejectedValue(new Error('Internal server error'))

    await expect(queryFn()).rejects.toThrow('Internal server error')
  })
})

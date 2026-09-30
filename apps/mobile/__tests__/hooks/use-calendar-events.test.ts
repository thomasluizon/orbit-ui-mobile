import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKeys } from '@orbit/shared/query'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { ZodError } from 'zod'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'

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

function captureQueryFn(): () => Promise<CalendarEventsResult> {
  let captured: (() => Promise<CalendarEventsResult>) | null = null
  mocks.useQuery.mockImplementation(
    (config: { queryFn: () => Promise<CalendarEventsResult> }) => {
      captured = config.queryFn
      return { data: undefined }
    },
  )
  return () => captured!()
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
    useCalendarEvents()
    const events = [createMockCalendarSyncEvent({ id: 'a' }), createMockCalendarSyncEvent({ id: 'b' })]
    mocks.apiClient.mockResolvedValue(events)

    const result = await queryFn()

    expect(result).toEqual({
      status: 'connected',
      events,
    })
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/calendar/events')
  })

  it.each([{}, [{ id: 1 }], null])('exposes a schema error for malformed events %j', async (body) => {
    const queryFn = captureQueryFn()
    useCalendarEvents()
    mocks.apiClient.mockResolvedValue(body)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const observer = new QueryObserver(queryClient, {
      queryKey: [...calendarKeys.all, 'manual-fetch'],
      queryFn,
    })
    const result = await observer.refetch()

    expect(result.isError).toBe(true)
    expect(result.error).toBeInstanceOf(ZodError)
    expect(result.data).toBeUndefined()
    queryClient.clear()
  })

  it('returns an empty connected list when no events are available', async () => {
    const queryFn = captureQueryFn()
    useCalendarEvents()
    mocks.apiClient.mockResolvedValue([])

    const result = await queryFn()

    expect(result).toEqual({ status: 'connected', events: [] })
  })

  it('maps a not-connected error to the not-connected status', async () => {
    const queryFn = captureQueryFn()
    useCalendarEvents()
    mocks.apiClient.mockRejectedValue(new Error('Google Calendar is not connected'))

    const result = await queryFn()

    expect(result).toEqual({ status: 'not-connected' })
  })

  it('maps an Unauthorized error to the not-connected status', async () => {
    const queryFn = captureQueryFn()
    useCalendarEvents()
    mocks.apiClient.mockRejectedValue(new Error('Unauthorized'))

    const result = await queryFn()

    expect(result).toEqual({ status: 'not-connected' })
  })

  it('rethrows unrelated network errors so the query surfaces them', async () => {
    const queryFn = captureQueryFn()
    useCalendarEvents()
    mocks.apiClient.mockRejectedValue(new Error('Internal server error'))

    await expect(queryFn()).rejects.toThrow('Internal server error')
  })
})

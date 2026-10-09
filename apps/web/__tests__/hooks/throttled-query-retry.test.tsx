import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { API } from '@orbit/shared/api'
import { subscriptionKeys } from '@orbit/shared/query'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import { useBilling } from '@/hooks/use-billing'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useCalendarData } from '@/hooks/use-calendar-data'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { createQueryClient } from '@/lib/query-client'
import { useThrottleStore } from '@/stores/throttle-store'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

vi.mock('@/lib/actions/api-keys', () => ({ createApiKey: vi.fn(), revokeApiKey: vi.fn() }))

const clients: QueryClient[] = []

function setupClient(immediate = true) {
  const client = createQueryClient()
  const defaults = client.getDefaultOptions()
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: immediate ? 0 : defaults.queries?.retryDelay } })
  clients.push(client)
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper: Wrapper }
}

afterEach(() => {
  cleanup()
  for (const client of clients) client.clear()
  clients.length = 0
  useThrottleStore.getState().clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('adapter query retry policy', () => {
  it('retains four attempts for a statusless error even when its prose mentions 429', async () => {
    const { client } = setupClient()
    const queryFn = vi.fn(() => Promise.reject(new Error('Failed with status 429')))
    await expect(client.fetchQuery({ queryKey: subscriptionKeys.status(), queryFn })).rejects.toThrow('Failed with status 429')
    expect(queryFn).toHaveBeenCalledTimes(4)
  })

  it.each([
    { name: 'API keys', endpoint: API.apiKeys.list, useHook: (client: QueryClient) => useApiKeyManagement({ hasProAccess: true, queryClient: client, t: (key) => key }).apiKeysQuery.error },
    { name: 'billing', endpoint: API.subscription.billing, useHook: () => useBilling(true).error },
    { name: 'calendar month', endpoint: API.habits.calendarMonth, useHook: () => useCalendarData(new Date(2026, 8, 1)).error },
    { name: 'reschedule suggestion', endpoint: API.habits.rescheduleSuggestion('habit-1'), useHook: () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }).error },
    { name: 'subscription status', endpoint: API.subscription.status, useHook: () => useSubscriptionStatus().error },
  ])('retries a background 429 from $name without showing a throttle screen', async ({ endpoint, useHook }) => {
    const payload = { error: 'Rate limited', requestId: 'request-reference', limit: 1, count: 2, retryAfterUtc: new Date(Date.now() + 60_000).toISOString() }
    const refusedFetch = vi.fn(() => Promise.resolve(Response.json(payload, { status: 429, headers: { 'Retry-After': '60' } })))
    vi.stubGlobal('fetch', (input: string) => input.split('?')[0] === endpoint ? refusedFetch() : Promise.resolve(Response.json([])))
    const { client, wrapper } = setupClient()
    const { result } = renderHook(() => useHook(client), { wrapper })
    await act(async () => {
      await expect(client.refetchQueries({ type: 'active' }, { cancelRefetch: false, throwOnError: true })).rejects.toMatchObject({ status: 429, retryAfter: '60' })
    })
    await waitFor(() => expect(result.current).toBeTruthy())
    expect(refusedFetch).toHaveBeenCalledTimes(7)
    expect(useThrottleStore.getState().error).toBeNull()
  })

  it.each([
    { name: 'calendar events', endpoint: API.calendar.events, useHook: () => useCalendarEvents({ timeZone: 'UTC' }).error },
    { name: 'reschedule suggestion', endpoint: API.habits.rescheduleSuggestion('habit-1'), useHook: () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }).error },
  ])('does not retry an offline 429 from $name', async ({ endpoint, useHook }) => {
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const refusedFetch = vi.fn(async () => Response.json(null, { status: 429 }))
    vi.stubGlobal('fetch', (input: string) => input.split('?')[0] === endpoint ? refusedFetch() : Promise.resolve(Response.json([])))
    const { client, wrapper } = setupClient()
    const { result } = renderHook(useHook, { wrapper })
    try {
      await act(async () => {
        await expect(client.refetchQueries({ type: 'active' }, { cancelRefetch: false, throwOnError: true })).rejects.toMatchObject({ status: 429 })
      })
      await waitFor(() => expect(result.current).toMatchObject({ status: 429 }))
      expect(refusedFetch).toHaveBeenCalledOnce()
    } finally {
      offline.mockRestore()
    }
  })

  it('keeps billing pending through Retry-After until automatic recovery', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(null, { status: 429, headers: { 'Retry-After': '60' } }))
      .mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = setupClient(false)
    const { result } = renderHook(() => useBilling(true), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999) })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isError).toBe(false)
    expect(useThrottleStore.getState().error).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.billing).toBeNull()
    expect(result.current.error).toBeNull()
  })
})

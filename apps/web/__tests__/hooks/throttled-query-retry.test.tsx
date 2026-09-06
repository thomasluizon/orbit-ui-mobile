import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { API } from '@orbit/shared/api'
import { subscriptionKeys } from '@orbit/shared/query'
import { getErrorSurface } from '@orbit/shared/utils'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import { useBilling } from '@/hooks/use-billing'
import { useCalendarData } from '@/hooks/use-calendar-data'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { createQueryClient } from '@/lib/query-client'
import { useThrottleStore } from '@/stores/throttle-store'

vi.mock('@/app/actions/api-keys', () => ({ createApiKey: vi.fn(), revokeApiKey: vi.fn() }))

const clients: QueryClient[] = []

function setupClient() {
  const client = createQueryClient()
  const defaults = client.getDefaultOptions()
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } })
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
    { name: 'AI capabilities', endpoint: API.ai.capabilities, useHook: (client: QueryClient) => useApiKeyManagement({ hasProAccess: true, queryClient: client, t: (key) => key }).capabilitiesQuery.error },
    { name: 'billing', endpoint: API.subscription.billing, useHook: () => useBilling(true).error },
    { name: 'calendar month', endpoint: API.habits.calendarMonth, useHook: () => useCalendarData(new Date(2026, 8, 1)).error },
    { name: 'reschedule suggestion', endpoint: API.habits.rescheduleSuggestion('habit-1'), useHook: () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }).error },
    { name: 'subscription status', endpoint: API.subscription.status, useHook: () => useSubscriptionStatus().error },
  ])('makes one request for a timed 429 from $name', async ({ endpoint, useHook }) => {
    const payload = { error: 'Rate limited', requestId: 'request-reference', limit: 1, count: 2, retryAfterUtc: new Date(Date.now() + 60_000).toISOString() }
    const refusedFetch = vi.fn(() => Promise.resolve(Response.json(payload, { status: 429 })))
    vi.stubGlobal('fetch', (input: string) => input.split('?')[0] === endpoint ? refusedFetch() : Promise.resolve(Response.json([])))
    const { client, wrapper } = setupClient()
    const { result } = renderHook(() => useHook(client), { wrapper })

    await waitFor(() => expect(result.current).toBeTruthy())
    expect(refusedFetch).toHaveBeenCalledTimes(1)
    expect(getErrorSurface(useThrottleStore.getState().error)).toEqual({ retryAt: Date.parse(payload.retryAfterUtc), requestId: payload.requestId })
  })

  it('keeps billing fetch idle through the wait until explicit successful recovery', async () => {
    const payload = { error: 'Rate limited', requestId: 'request-reference', limit: 1, count: 2, retryAfterUtc: new Date(Date.now() + 60_000).toISOString() }
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(payload, { status: 429 })))
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = setupClient()
    const { result, rerender } = renderHook(() => useBilling(true), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.error).toMatchObject({ status: 429, message: 'Rate limited' })
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse(payload.retryAfterUtc) - 60_000)
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999) })
    rerender()
    expect(Date.now()).toBeLessThan(Date.parse(payload.retryAfterUtc))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    useThrottleStore.getState().clear()
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 404 })))
    await act(async () => { await result.current.refetch() })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.billing).toBeNull()
    expect(result.current.error).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configKeys, gamificationKeys, habitKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared/utils'

import {
  queryClient,
  persistQueryCache,
  restoreQueryCache,
  setQueryCacheScope,
  clearPersistedQueryCache,
  QUERY_CACHE_VERSION,
} from '@/lib/query-client'

const { getItemMock, setItemMock, removeItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  setItemMock: vi.fn(),
  removeItemMock: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: getItemMock,
    setItem: setItemMock,
    removeItem: removeItemMock,
  },
}))

describe('mobile query client', () => {
  beforeEach(async () => {
    getItemMock.mockReset()
    setItemMock.mockReset()
    removeItemMock.mockReset()
    queryClient.clear()
    await setQueryCacheScope(null)
    getItemMock.mockReset()
    setItemMock.mockReset()
    removeItemMock.mockReset()
  })

  it('uses the expected retry and stale defaults', () => {
    const defaults = queryClient.getDefaultOptions()
    const retry = defaults.queries?.retry as (failureCount: number, error: Error) => boolean

    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000)
    expect(defaults.queries?.gcTime).toBe(24 * 60 * 60 * 1000)
    expect(defaults.mutations?.retry).toBe(false)
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true)
    expect(defaults.queries?.refetchOnReconnect).toBe(true)
    expect(retry(2, new Error('network'))).toBe(true)
    expect(retry(3, new Error('network'))).toBe(false)
  })

  it.each([
    createApiClientError(401, { error: 'Unauthorized' }, 'Unauthorized'),
    createApiClientError(403, { error: 'Pro access required', errorCode: 'PAY_GATE' }, 'Forbidden'),
  ])('does not retry a final response with status $status', (error) => {
    const retry = queryClient.getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: Error
    ) => boolean

    expect(retry(0, error)).toBe(false)
  })

  it.each([
    habitKeys.retrospective('month'),
    gamificationKeys.profile(),
  ])('settles a gated query on the first response: %s', async (...queryKey) => {
    vi.useFakeTimers()
    const client = queryClient
    const error = createApiClientError(403, { error: 'Pro access required', errorCode: 'PAY_GATE' }, 'Forbidden')
    const queryFn = vi.fn().mockRejectedValue(error)
    const result = client.fetchQuery({ queryKey, queryFn }).catch((failure: unknown) => failure)

    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(client.getQueryState(queryKey)?.status).toBe('error')
      expect(client.getQueryState(queryKey)?.error).toBe(error)
      await vi.advanceTimersByTimeAsync(8000)
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(await result).toBe(error)
    } finally {
      client.clear()
      await vi.advanceTimersByTimeAsync(8000)
      vi.useRealTimers()
    }
  })

  it('persists only successful query results under the active account scope', async () => {
    await setQueryCacheScope('user-1')
    queryClient.setQueryData(['good'], { ok: true }, { updatedAt: 123 })

    await persistQueryCache()

    expect(setItemMock).toHaveBeenCalledWith(
      '@orbit/query-cache:user-1',
      JSON.stringify({
        version: QUERY_CACHE_VERSION,
        entries: [
          {
            queryKey: ['good'],
            state: {
              data: { ok: true },
              dataUpdatedAt: 123,
            },
          },
        ],
      }),
    )
  })

  it('restores cached query results for the active account scope', async () => {
    await setQueryCacheScope('user-1')
    getItemMock.mockResolvedValue(
      JSON.stringify({
        version: QUERY_CACHE_VERSION,
        entries: [
          {
            queryKey: ['restored'],
            state: {
              data: { value: 1 },
              dataUpdatedAt: 456,
            },
          },
        ],
      }),
    )

    await restoreQueryCache()

    expect(getItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-1')
    expect(queryClient.getQueryData(['restored'])).toEqual({ value: 1 })
  })

  it('does not trust a persisted analytics flag before a fresh config response', async () => {
    await setQueryCacheScope('user-1')
    queryClient.setQueryData(configKeys.detail(), { features: { analytics: { enabled: true, planRequirement: null } } })
    await persistQueryCache()
    const written = JSON.parse(setItemMock.mock.calls[0]![1] as string) as { entries: { queryKey: unknown[] }[] }
    expect(written.entries).not.toContainEqual(expect.objectContaining({ queryKey: configKeys.detail() }))

    queryClient.clear()
    getItemMock.mockResolvedValue(JSON.stringify({
      version: QUERY_CACHE_VERSION,
      entries: [{
        queryKey: configKeys.detail(),
        state: { data: { features: { analytics: { enabled: true, planRequirement: null } } }, dataUpdatedAt: 456 },
      }],
    }))
    await restoreQueryCache()
    expect(queryClient.getQueryData(configKeys.detail())).toBeUndefined()
  })

  it('discards a persisted cache written by an older schema version', async () => {
    await setQueryCacheScope('user-1')
    getItemMock.mockResolvedValue(
      JSON.stringify({
        version: QUERY_CACHE_VERSION - 1,
        entries: [
          { queryKey: ['stale'], state: { data: { old: true }, dataUpdatedAt: 1 } },
        ],
      }),
    )

    await restoreQueryCache()

    expect(queryClient.getQueryData(['stale'])).toBeUndefined()
    expect(removeItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-1')
  })

  it('discards the legacy unversioned array cache format', async () => {
    await setQueryCacheScope('user-1')
    getItemMock.mockResolvedValue(
      JSON.stringify([
        { queryKey: ['legacy'], state: { data: { old: true }, dataUpdatedAt: 1 } },
      ]),
    )

    await restoreQueryCache()

    expect(queryClient.getQueryData(['legacy'])).toBeUndefined()
    expect(removeItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-1')
  })

  it('does not persist or restore when no account scope is set', async () => {
    queryClient.setQueryData(['good'], { ok: true }, { updatedAt: 123 })

    await persistQueryCache()
    await restoreQueryCache()

    expect(setItemMock).not.toHaveBeenCalled()
    expect(getItemMock).not.toHaveBeenCalled()
  })

  it('does not restore one account cache under a different account', async () => {
    getItemMock.mockImplementation((key: string) =>
      key === '@orbit/query-cache:user-1'
        ? JSON.stringify([
            { queryKey: ['secret'], state: { data: { a: 1 }, dataUpdatedAt: 1 } },
          ])
        : null,
    )

    await setQueryCacheScope('user-2')
    await restoreQueryCache()

    expect(getItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-2')
    expect(queryClient.getQueryData(['secret'])).toBeUndefined()
  })

  it('clears the previous account cache when switching scope', async () => {
    await setQueryCacheScope('user-1')
    removeItemMock.mockClear()

    await setQueryCacheScope('user-2')

    expect(removeItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-1')
  })

  it('clears the scoped and legacy persisted caches on demand', async () => {
    await setQueryCacheScope('user-1')
    removeItemMock.mockClear()

    await clearPersistedQueryCache()

    expect(removeItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-1')
    expect(removeItemMock).toHaveBeenCalledWith('@orbit/query-cache')
  })
})

it('keeps a 429 read pending until the retry returns data', async () => {
  vi.useFakeTimers()
  const client = queryClient
  const queryKey = habitKeys.list({})
  const error = Object.assign(createApiClientError(429, null, 'Unavailable'), { retryAfter: '60' })
  const queryFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(['Recovered'])
  const states: string[] = []
  const unsubscribe = client.getQueryCache().subscribe(() => {
    const status = client.getQueryState(queryKey)?.status
    if (status) states.push(status)
  })
  const result = client.fetchQuery({ queryKey, queryFn }).catch((failure: unknown) => failure)
  try {
    await vi.advanceTimersByTimeAsync(59_999)
    expect(client.getQueryState(queryKey)?.status).toBe('pending')
    expect(queryFn).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual(['Recovered'])
    expect(states).not.toContain('error')
    queryFn.mockRejectedValueOnce(error).mockResolvedValue(['Updated'])
    const refetch = client.fetchQuery({ queryKey, queryFn, staleTime: 0 })
    await vi.advanceTimersByTimeAsync(59_999)
    expect(client.getQueryData(queryKey)).toEqual(['Recovered'])
    expect(client.getQueryState(queryKey)?.status).toBe('success')
    await vi.advanceTimersByTimeAsync(1)
    expect(await refetch).toEqual(['Updated'])
    const exhaustedKey = habitKeys.list({ search: 'exhausted' })
    const exhausted = client.fetchQuery({
      queryKey: exhaustedKey,
      queryFn: () => Promise.reject(createApiClientError(429, null, 'Unavailable')),
    }).catch((failure: unknown) => failure)
    await vi.advanceTimersByTimeAsync(124_999)
    expect(client.getQueryState(exhaustedKey)?.status).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(await exhausted).toMatchObject({ status: 429 })
    expect(client.getQueryState(exhaustedKey)?.status).toBe('error')
  } finally {
    unsubscribe()
    client.clear()
    vi.useRealTimers()
  }
})

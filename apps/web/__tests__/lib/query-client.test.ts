import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { createQueryClient, getQueryClient } from '@/lib/query-client'
import { ApiError } from '@/lib/api-fetch'
import { gamificationKeys, habitKeys } from '@orbit/shared/query'

describe('createQueryClient', () => {
  it('returns a QueryClient instance', () => {
    const client = createQueryClient()
    expect(client).toBeInstanceOf(QueryClient)
  })

  it('sets staleTime to 5 minutes', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000)
  })

  it('sets gcTime to 24 hours', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.gcTime).toBe(24 * 60 * 60 * 1000)
  })

  it('disables mutation retry', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.mutations?.retry).toBe(false)
  })

  it('enables refetchOnWindowFocus', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true)
  })

  it('enables refetchOnReconnect', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.refetchOnReconnect).toBe(true)
  })

  it.each([
    habitKeys.retrospective('month'),
    gamificationKeys.profile(),
  ])('settles a gated query on the first response: %s', async (...queryKey) => {
    vi.useFakeTimers()
    const client = createQueryClient()
    const error = new ApiError(403, 'Forbidden', { error: 'Pro access required', errorCode: 'PAY_GATE' })
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

  describe('retry logic', () => {
    it('retries up to 3 times normally', () => {
      const client = createQueryClient()
      const retryFn = client.getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: Error
      ) => boolean

      expect(retryFn(0, new Error('random error'))).toBe(true)
      expect(retryFn(1, new Error('random error'))).toBe(true)
      expect(retryFn(2, new Error('random error'))).toBe(true)
      expect(retryFn(3, new Error('random error'))).toBe(false)
    })

    it('does not retry on 401 errors', () => {
      const client = createQueryClient()
      const retryFn = client.getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: Error
      ) => boolean

      expect(retryFn(0, new ApiError(401, 'Unauthorized', { error: 'Unauthorized' }))).toBe(false)
    })

    it('does not retry a Pro gate', () => {
      const retry = createQueryClient().getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: Error
      ) => boolean

      expect(retry(0, new ApiError(403, 'Forbidden', {
        error: 'Pro access required', errorCode: 'PAY_GATE',
      }))).toBe(false)
    })

    it('retries a rate limit', () => {
      const retry = createQueryClient().getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: Error
      ) => boolean

      expect(retry(0, new ApiError(429, 'Too many requests', {}))).toBe(true)
    })

    it('does not retry when offline', () => {
      const originalNavigator = globalThis.navigator
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      })

      const client = createQueryClient()
      const retryFn = client.getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: Error
      ) => boolean

      expect(retryFn(0, new Error('random error'))).toBe(false)

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      })
    })
  })
})

describe('getQueryClient', () => {
  it('returns a QueryClient in browser environment', () => {
    const client = getQueryClient()
    expect(client).toBeInstanceOf(QueryClient)
  })

  it('returns same instance on subsequent calls (singleton)', () => {
    const client1 = getQueryClient()
    const client2 = getQueryClient()
    expect(client1).toBe(client2)
  })
})

it('keeps a 429 read pending until the retry returns data', async () => {
  vi.useFakeTimers()
  const client = createQueryClient()
  const queryKey = habitKeys.list({})
  const error = Object.assign(new ApiError(429, 'Unavailable'), { retryAfter: '60' })
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
  } finally {
    unsubscribe()
    client.clear()
    vi.useRealTimers()
  }
})

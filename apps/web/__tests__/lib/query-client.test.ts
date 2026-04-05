import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { createQueryClient, getQueryClient } from '@/lib/query-client'

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

      expect(retryFn(0, new Error('Request failed with status 401'))).toBe(false)
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

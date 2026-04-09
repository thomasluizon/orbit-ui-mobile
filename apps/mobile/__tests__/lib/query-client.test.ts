import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getItemMock, setItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  setItemMock: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: getItemMock,
    setItem: setItemMock,
  },
}))

import { queryClient, persistQueryCache, restoreQueryCache } from '@/lib/query-client'

describe('mobile query client', () => {
  beforeEach(() => {
    getItemMock.mockReset()
    setItemMock.mockReset()
    queryClient.clear()
  })

  it('uses the expected retry and stale defaults', () => {
    const defaults = queryClient.getDefaultOptions()
    const retry = defaults.queries?.retry as (failureCount: number, error: Error) => boolean

    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000)
    expect(defaults.queries?.gcTime).toBe(24 * 60 * 60 * 1000)
    expect(defaults.mutations?.retry).toBe(false)
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true)
    expect(defaults.queries?.refetchOnReconnect).toBe(true)
    expect(retry(0, new Error('status 401'))).toBe(false)
    expect(retry(2, new Error('network'))).toBe(true)
    expect(retry(3, new Error('network'))).toBe(false)
  })

  it('persists only successful query results', async () => {
    queryClient.setQueryData(['good'], { ok: true }, { updatedAt: 123 })

    await persistQueryCache()

    expect(setItemMock).toHaveBeenCalledWith(
      '@orbit/query-cache',
      JSON.stringify([
        {
          queryKey: ['good'],
          state: {
            data: { ok: true },
            dataUpdatedAt: 123,
          },
        },
      ]),
    )
  })

  it('restores cached query results', async () => {
    getItemMock.mockResolvedValue(
      JSON.stringify([
        {
          queryKey: ['restored'],
          state: {
            data: { value: 1 },
            dataUpdatedAt: 456,
          },
        },
      ]),
    )

    await restoreQueryCache()

    expect(queryClient.getQueryData(['restored'])).toEqual({ value: 1 })
  })
})

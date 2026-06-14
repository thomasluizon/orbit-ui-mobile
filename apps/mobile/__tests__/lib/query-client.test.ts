import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  queryClient,
  persistQueryCache,
  restoreQueryCache,
  setQueryCacheScope,
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
    expect(retry(0, new Error('status 401'))).toBe(false)
    expect(retry(2, new Error('network'))).toBe(true)
    expect(retry(3, new Error('network'))).toBe(false)
  })

  it('persists only successful query results under the active account scope', async () => {
    await setQueryCacheScope('user-1')
    queryClient.setQueryData(['good'], { ok: true }, { updatedAt: 123 })

    await persistQueryCache()

    expect(setItemMock).toHaveBeenCalledWith(
      '@orbit/query-cache:user-1',
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

  it('restores cached query results for the active account scope', async () => {
    await setQueryCacheScope('user-1')
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

    expect(getItemMock).toHaveBeenCalledWith('@orbit/query-cache:user-1')
    expect(queryClient.getQueryData(['restored'])).toEqual({ value: 1 })
  })

  it('does not persist or restore when no account scope is set', async () => {
    queryClient.setQueryData(['good'], { ok: true }, { updatedAt: 123 })

    await persistQueryCache()
    await restoreQueryCache()

    expect(setItemMock).not.toHaveBeenCalled()
    expect(getItemMock).not.toHaveBeenCalled()
  })

  it('does not restore one account cache under a different account', async () => {
    getItemMock.mockImplementation(async (key: string) =>
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
})

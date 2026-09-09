import { beforeEach, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import type { QueuedMutation } from '@orbit/shared/types/sync'

const storage = vi.hoisted(() => new Map<string, string>())

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => { storage.set(key, value); return Promise.resolve() },
    removeItem: (key: string) => { storage.delete(key); return Promise.resolve() },
  },
}))
vi.mock('@/lib/offline-queue', () => ({
  enqueue: (mutation: QueuedMutation) => mutation.id,
  findUnfinalizedFirstWrite: () => null,
}))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: () => Promise.resolve(false) }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/offline-state', () => ({}))

beforeEach(() => {
  vi.resetModules()
  storage.clear()
})

it.each([
  { type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/habit-1' },
  { type: 'assignTags', scope: 'tags', endpoint: '/api/habits/habit-1/tags' },
] as const)('restores the queued $type optimistic list without stale search pages after process death', async (mutation) => {
  const live = await import('@/lib/query-client')
  const { runQueuedMutation } = await import('@/lib/offline-mutations')
  await live.setQueryCacheScope('user-1')
  const listKey = habitKeys.list({})
  const searchKeys = [habitKeys.search({ search: 'old', page: 1 }), habitKeys.search({ search: 'old', page: 2 })]
  const original = [{ id: 'habit-1', title: 'old', tags: ['old'] }]
  live.queryClient.setQueryData(listKey, original)
  for (const key of searchKeys) live.queryClient.setQueryData(key, { items: original, totalCount: 2, totalPages: 2 })
  await live.persistQueryCache()
  const optimistic = [{ id: 'habit-1', title: 'new', tags: [] }]
  live.queryClient.setQueryData(listKey, optimistic)
  const execute = vi.fn()
  const result = await runQueuedMutation({
    mutation: { ...mutation, method: 'PUT', payload: optimistic[0] },
    execute,
  })
  expect(result).toMatchObject({ queued: true })
  expect(execute).not.toHaveBeenCalled()

  vi.resetModules()
  const restarted = await import('@/lib/query-client')
  expect(restarted.queryClient).not.toBe(live.queryClient)
  expect(restarted.queryClient.getQueryCache().getAll()).toHaveLength(0)
  await restarted.setQueryCacheScope('user-1')
  await restarted.restoreQueryCache()
  expect(restarted.queryClient.getQueryData(listKey)).toEqual(optimistic)
  for (const key of searchKeys) expect(restarted.queryClient.getQueryData(key)).toBeUndefined()
  live.queryClient.clear()
  restarted.queryClient.clear()
})

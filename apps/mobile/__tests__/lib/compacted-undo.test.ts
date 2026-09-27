import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildQueuedMutation,
  cancelQueuedDeleteForUndo,
  cancelScheduledFlush,
  flushQueuedMutations,
  queueOrExecute,
} from '@/lib/offline-mutations'
import { getAll } from '@/lib/offline-queue'

const mocks = vi.hoisted(() => {
  const rows = new Map<string, {
    id: string; timestamp: number; type: string; endpoint: string; method: string
    payload: string; retries: number; max_retries: number; meta: string
  }>()
  let online = false
  return {
    rows,
    setOnline(value: boolean) { online = value },
    getCurrentConnectivity: vi.fn(() => Promise.resolve(online)),
    apiClient: vi.fn(),
    markOfflineTombstone: vi.fn(() => Promise.resolve()),
  }
})

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => {},
    getAllSync: (sql: string) => sql.startsWith('PRAGMA')
      ? [{ name: 'meta' }]
      : [...mocks.rows.values()].sort((left, right) => left.timestamp - right.timestamp),
    getFirstSync: () => ({ cnt: mocks.rows.size }),
    runSync: (sql: string, params: unknown[] = []) => {
      if (sql === 'DELETE FROM mutation_queue') mocks.rows.clear()
      else if (sql.startsWith('DELETE FROM mutation_queue WHERE')) mocks.rows.delete(String(params[0]))
      else if (sql.startsWith('INSERT OR REPLACE INTO mutation_queue')) {
        const [id, timestamp, type, endpoint, method, payload, retries, max_retries, meta] = params
        mocks.rows.set(String(id), {
          id: String(id), timestamp: Number(timestamp), type: String(type),
          endpoint: String(endpoint), method: String(method), payload: String(payload),
          retries: Number(retries), max_retries: Number(max_retries), meta: String(meta),
        })
      }
    },
    withTransactionSync: (task: () => void) => task(),
  }),
}))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'test-account' }))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: mocks.getCurrentConnectivity }))
vi.mock('@/lib/offline-state', () => ({
  upsertOfflineEntity: () => Promise.resolve(),
  setOfflineEntityStatus: () => Promise.resolve(),
  clearOfflineEntity: () => Promise.resolve(),
  markOfflineTombstone: mocks.markOfflineTombstone,
  resolveOfflineEntity: () => Promise.resolve(),
  getResolvedEntityId: (_type: string, id: string) => Promise.resolve(id),
}))
vi.mock('@/lib/query-client', () => ({
  persistQueryCache: () => Promise.resolve(),
  queryClient: { invalidateQueries: () => Promise.resolve(), getQueriesData: () => [] },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/stores/offline-sync-store', () => ({
  useOfflineSyncStore: { getState: () => ({ addDrop: vi.fn() }), setState: vi.fn() },
}))

describe('compacted offline delete Undo', () => {
  beforeEach(() => {
    mocks.rows.clear()
    mocks.setOnline(false)
    mocks.apiClient.mockReset()
    mocks.markOfflineTombstone.mockClear()
    cancelScheduledFlush()
  })

  it.each([
    ['habit', 'habits', 'Habit', '/api/habits'],
    ['goal', 'goals', 'Goal', '/api/goals'],
  ] as const)('replays an undone offline %s create once', async (entityType, scope, suffix, endpoint) => {
    const entityId = `offline-${entityType}-1`
    const payload = { title: `Read ${suffix}` }
    const create = buildQueuedMutation({
      type: `create${suffix}`, scope, endpoint, method: 'POST', payload,
      entityType, clientEntityId: entityId,
    })
    const deletion = buildQueuedMutation({
      type: `delete${suffix}`, scope, endpoint: `${endpoint}/${entityId}`,
      method: 'DELETE', payload: null, entityType, targetEntityId: entityId,
    })

    await queueOrExecute({ mutation: create, execute: () => Promise.resolve(null), queuedResult: null })
    await queueOrExecute({ mutation: deletion, execute: () => Promise.resolve(null), queuedResult: null })
    expect(getAll()).toHaveLength(0)

    expect(await cancelQueuedDeleteForUndo(deletion.id)).toBe('cancelled')
    expect(getAll()).toEqual([expect.objectContaining({
      id: create.id, type: create.type, payload,
    })])
    expect(mocks.markOfflineTombstone).toHaveBeenLastCalledWith(entityType, entityId, false)

    const serverItems: string[] = []
    mocks.apiClient.mockImplementation((url: string, options: { method: string }) => {
      if (options.method === 'POST' && url === endpoint) {
        serverItems.push(payload.title)
        return Promise.resolve({ id: `${entityType}-server-1` })
      }
      throw new Error(`Unexpected replay: ${options.method} ${url}`)
    })
    mocks.setOnline(true)
    await flushQueuedMutations()
    expect(serverItems).toEqual([payload.title])
    expect(getAll()).toHaveLength(0)
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })
})

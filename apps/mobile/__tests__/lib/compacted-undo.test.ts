import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import {
  buildQueuedMutation,
  cancelQueuedDeleteForUndo,
  cancelScheduledFlush,
  flushQueuedMutations,
  queueOrExecute,
} from '@/lib/offline-mutations'
import { clear, getAll } from '@/lib/offline-queue'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { startAccountScopedSession } from '@/lib/account-scoped-state'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const rows = new Map<string, {
    id: string; timestamp: number; type: string; endpoint: string; method: string
    payload: string; retries: number; max_retries: number; meta: string
  }>()
  let online = false
  let accountId: string | null = 'test-account'
  return {
    rows,
    setOnline(value: boolean) { online = value },
    setAccountId(value: string | null) { accountId = value },
    getAccountId: () => accountId,
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
vi.mock('@/lib/account-scope', () => ({ getAccountId: mocks.getAccountId, setAccountId: mocks.setAccountId }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/stores/referral-prompt-store', () => ({ setEngagementPromptAccountScope: () => Promise.resolve() }))
vi.mock('@/stores/ui-store', () => ({ setUIAccountScope: () => Promise.resolve() }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: {
    getState: () => ({ reset: () => {}, setAccountScope: () => {} }),
    persist: { rehydrate: () => Promise.resolve() },
  },
}))
vi.mock('@/stores/tour-store', () => ({
  useTourStore: { getInitialState: () => ({}), setState: () => {} },
}))
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
    mocks.setAccountId('test-account')
    mocks.apiClient.mockReset()
    mocks.markOfflineTombstone.mockClear()
    cancelScheduledFlush()
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })

  async function queueCompactedDelete(entityType: 'habit' | 'goal') {
    const suffix = entityType === 'habit' ? 'Habit' : 'Goal'
    const scope = entityType === 'habit' ? 'habits' : 'goals'
    const entityId = `offline-${entityType}-1`
    const create = buildQueuedMutation({
      type: `create${suffix}`, scope, endpoint: `/api/${scope}`, method: 'POST',
      payload: { title: suffix }, entityType, clientEntityId: entityId,
    })
    const deletion = buildQueuedMutation({
      type: `delete${suffix}`, scope, endpoint: `/api/${scope}/${entityId}`,
      method: 'DELETE', payload: null, entityType, targetEntityId: entityId,
    })
    await queueOrExecute({ mutation: create, execute: () => Promise.resolve(null), queuedResult: null })
    await queueOrExecute({ mutation: deletion, execute: () => Promise.resolve(null), queuedResult: null })
    expect(getAll()).toHaveLength(0)
    return deletion.id
  }

  it.each(['habit', 'goal'] as const)('drops a %s create when its Undo toast expires', async (entityType) => {
    const deletionId = await queueCompactedDelete(entityType)
    let showUndoToast!: ReturnType<typeof useUndoToast>
    function Probe() {
      showUndoToast = useUndoToast()
      return null
    }
    TestRenderer.act(() => { TestRenderer.create(React.createElement(Probe)) })
    TestRenderer.act(() => {
      showUndoToast('Deleted', () => { void cancelQueuedDeleteForUndo(deletionId) }, deletionId)
      useAppToastStore.getState().dismissToast()
    })

    expect(await cancelQueuedDeleteForUndo(deletionId)).toBe('replayed')
    expect(getAll()).toHaveLength(0)
  })

  it.each(['habit', 'goal'] as const)('drops a %s create when the queue clears', async (entityType) => {
    const deletionId = await queueCompactedDelete(entityType)
    clear()

    expect(await cancelQueuedDeleteForUndo(deletionId)).toBe('replayed')
    expect(getAll()).toHaveLength(0)
  })

  it.each(['habit', 'goal'] as const)('does not undo a %s delete in another account', async (entityType) => {
    const deletionId = await queueCompactedDelete(entityType)
    mocks.setAccountId('replacement-account')

    expect(await cancelQueuedDeleteForUndo(deletionId)).toBe('replayed')
    expect(getAll()).toHaveLength(0)
  })

  it.each([
    ['habit', 'test-account'],
    ['goal', null],
  ] as const)('drops a %s create when account scope resets to %s', async (entityType, accountId) => {
    const deletionId = await queueCompactedDelete(entityType)
    await startAccountScopedSession(accountId)

    expect(await cancelQueuedDeleteForUndo(deletionId)).toBe('replayed')
    expect(getAll()).toHaveLength(0)
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
    expect(await cancelQueuedDeleteForUndo(deletion.id)).toBe('replayed')
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

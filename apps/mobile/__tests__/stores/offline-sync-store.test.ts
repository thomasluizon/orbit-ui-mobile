import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DroppedMutation } from '@/lib/offline-mutations'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const storageKey = '@orbit/offline-sync-notices'

function drop(id: string): DroppedMutation {
  return {
    id, type: 'logHabit', lastError: '500',
    mutation: {
      id, type: 'logHabit', timestamp: 1, retries: 3, maxRetries: 3,
      scope: 'habits', endpoint: '/api/habits/walk/log', method: 'POST', payload: null,
    },
  }
}

async function startHydration() {
  vi.resetModules()
  let resolveRead!: (value: string | null) => void
  const saved = new Map([[storageKey, JSON.stringify({ state: { drops: [drop('old')] }, version: 0 })]])
  const snapshot = saved.get(storageKey)!
  const getItem = vi.fn((key: string) => Promise.resolve(saved.get(key) ?? null))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
  vi.doMock('@react-native-async-storage/async-storage', () => ({ default: {
    getItem,
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); return Promise.resolve() }),
    removeItem: vi.fn((key: string) => { saved.delete(key); return Promise.resolve() }),
  } }))
  const { useOfflineSyncStore: store } = await import('@/stores/offline-sync-store')
  const hydrated = new Promise<void>((resolve) => { store.persist.onFinishHydration(() => resolve()) })
  return { store, saved, getItem, finish: async () => { resolveRead(snapshot); await hydrated } }
}

afterEach(() => { vi.doUnmock('@react-native-async-storage/async-storage') })

describe('offline recovery hydration', () => {
  it('retains and persists startup drops alongside saved drops', async () => {
    const { store, saved, finish } = await startHydration()
    store.getState().addDrop(drop('new'))
    await finish()
    expect(store.getState().drops.map((entry) => entry.id).sort((a, b) => a.localeCompare(b))).toEqual(['new', 'old'])
    expect(JSON.parse(saved.get(storageKey)!).state.drops).toHaveLength(2)
    await store.persist.rehydrate()
    expect(store.getState().drops).toHaveLength(2)
  })

  it.each(['fresh-start', 'account-reset'])('does not resurrect drops after %s and a late read', async (reset) => {
    const { store, saved, getItem, finish } = await startHydration()
    store.getState().addDrop(drop('before-reset'))
    if (reset === 'fresh-start') await store.getState().clearDrops()
    else await (await import('@/lib/offline-state')).clearOfflineState()
    store.getState().addDrop(drop('after-reset'))
    await finish()
    expect(store.getState().drops.map((entry) => entry.id)).toEqual(['after-reset'])
    expect(JSON.parse(saved.get(storageKey)!).state.drops.map((entry: DroppedMutation) => entry.id)).toEqual(['after-reset'])
    expect(getItem).toHaveBeenCalledTimes(1)
  })

  it('does not restore a dismissed drop from a pending read', async () => {
    const { store, saved, finish } = await startHydration()
    store.getState().addDrop(drop('old'))
    store.getState().dismissDrop('old')
    await finish()
    expect(store.getState().drops).toEqual([])
    expect(JSON.parse(saved.get(storageKey)!).state.drops).toEqual([])
  })
})

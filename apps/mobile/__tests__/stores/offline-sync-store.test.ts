import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DroppedMutation } from '@/lib/offline-mutations'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'

const storage = vi.hoisted(() => ({
  getItem: vi.fn(() => Promise.resolve(null as string | null)),
  setItem: vi.fn(() => Promise.resolve()),
  removeItem: vi.fn(() => Promise.resolve()),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: storage,
}))

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

function drop(id: string): DroppedMutation {
  return {
    id,
    type: 'updateHabit',
    lastError: 'validation failed',
    mutation: {
      id,
      timestamp: 1,
      type: 'updateHabit',
      endpoint: `/api/habits/${id}`,
      method: 'PUT',
      payload: { title: id },
      retries: 5,
      maxRetries: 5,
      scope: 'habits',
    },
  }
}

describe('offline sync store', () => {
  beforeEach(() => {
    storage.getItem.mockReset()
    storage.getItem.mockResolvedValue(null)
    storage.setItem.mockClear()
    useOfflineSyncStore.setState({ drops: [], isFlushing: false, isRetrying: false })
  })

  it('deduplicates drops and dismisses only the selected recovery', () => {
    const first = drop('first')
    useOfflineSyncStore.getState().addDrop(first)
    useOfflineSyncStore.getState().addDrop(first)
    useOfflineSyncStore.getState().addDrop(drop('second'))

    expect(useOfflineSyncStore.getState().drops.map((entry) => entry.id)).toEqual([
      'first',
      'second',
    ])
    useOfflineSyncStore.getState().dismissDrop('first')
    expect(useOfflineSyncStore.getState().drops.map((entry) => entry.id)).toEqual(['second'])
  })

  it('clears every persisted recovery after Fresh Start', async () => {
    useOfflineSyncStore.getState().addDrop(drop('pre-reset'))
    await useOfflineSyncStore.getState().clearDrops()
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(storage.setItem).toHaveBeenLastCalledWith(
      '@orbit/offline-sync-notices',
      expect.stringContaining('"drops":[]'),
    )
  })

  it('rehydrates saved drops once without duplicating live state', async () => {
    const saved = drop('saved')
    storage.getItem.mockResolvedValueOnce(JSON.stringify({ state: { drops: [saved] }, version: 0 }))
    useOfflineSyncStore.getState().addDrop(saved)
    await useOfflineSyncStore.persist.rehydrate()
    expect(useOfflineSyncStore.getState().drops).toEqual([saved])
  })
})

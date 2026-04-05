import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueuedMutation } from '@orbit/shared/types/sync'

// Mock idb
const mockStore = new Map<string, QueuedMutation>()

vi.mock('idb', () => ({
  openDB: vi.fn(() =>
    Promise.resolve({
      put: vi.fn((storeName: string, value: QueuedMutation) => {
        mockStore.set(value.id, value)
        return Promise.resolve()
      }),
      delete: vi.fn((storeName: string, key: string) => {
        mockStore.delete(key)
        return Promise.resolve()
      }),
      getAll: vi.fn(() => Promise.resolve(Array.from(mockStore.values()))),
      count: vi.fn(() => Promise.resolve(mockStore.size)),
      clear: vi.fn(() => {
        mockStore.clear()
        return Promise.resolve()
      }),
    }),
  ),
}))

// Mock fetch for replayQueue
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import {
  enqueueMutation,
  dequeueMutation,
  getAllMutations,
  getQueueSize,
  clearQueue,
  replayQueue,
} from '@/lib/offline-queue'

function makeMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: 'mut-1',
    timestamp: Date.now(),
    type: 'createHabit',
    endpoint: '/api/habits',
    method: 'POST',
    payload: { title: 'Exercise' },
    retries: 0,
    maxRetries: 3,
    ...overrides,
  }
}

describe('offline-queue', () => {
  beforeEach(() => {
    mockStore.clear()
    mockFetch.mockReset()
  })

  describe('enqueueMutation', () => {
    it('adds mutation to the store', async () => {
      const mutation = makeMutation({ id: 'mut-1' })
      await enqueueMutation(mutation)

      expect(mockStore.has('mut-1')).toBe(true)
      expect(mockStore.get('mut-1')).toEqual(mutation)
    })
  })

  describe('dequeueMutation', () => {
    it('removes mutation from the store', async () => {
      mockStore.set('mut-1', makeMutation({ id: 'mut-1' }))

      await dequeueMutation('mut-1')
      expect(mockStore.has('mut-1')).toBe(false)
    })
  })

  describe('getAllMutations', () => {
    it('returns mutations sorted by timestamp', async () => {
      const mut1 = makeMutation({ id: 'mut-1', timestamp: 300 })
      const mut2 = makeMutation({ id: 'mut-2', timestamp: 100 })
      const mut3 = makeMutation({ id: 'mut-3', timestamp: 200 })
      mockStore.set('mut-1', mut1)
      mockStore.set('mut-2', mut2)
      mockStore.set('mut-3', mut3)

      const result = await getAllMutations()
      expect(result[0]!.id).toBe('mut-2')
      expect(result[1]!.id).toBe('mut-3')
      expect(result[2]!.id).toBe('mut-1')
    })

    it('returns empty array when no mutations', async () => {
      const result = await getAllMutations()
      expect(result).toEqual([])
    })
  })

  describe('getQueueSize', () => {
    it('returns count of mutations in store', async () => {
      mockStore.set('mut-1', makeMutation({ id: 'mut-1' }))
      mockStore.set('mut-2', makeMutation({ id: 'mut-2' }))

      const size = await getQueueSize()
      expect(size).toBe(2)
    })

    it('returns 0 for empty store', async () => {
      const size = await getQueueSize()
      expect(size).toBe(0)
    })
  })

  describe('clearQueue', () => {
    it('removes all mutations from store', async () => {
      mockStore.set('mut-1', makeMutation({ id: 'mut-1' }))
      mockStore.set('mut-2', makeMutation({ id: 'mut-2' }))

      await clearQueue()
      expect(mockStore.size).toBe(0)
    })
  })

  describe('replayQueue', () => {
    it('replays successful mutations and removes them', async () => {
      const mut = makeMutation({ id: 'replay-1', timestamp: 100 })
      mockStore.set('replay-1', mut)

      mockFetch.mockResolvedValue({ ok: true })

      const result = await replayQueue()
      expect(result).toEqual({ succeeded: 1, failed: 0 })
      expect(mockStore.has('replay-1')).toBe(false)
    })

    it('discards 404/409/410 mutations', async () => {
      mockStore.set('mut-404', makeMutation({ id: 'mut-404', timestamp: 100 }))

      mockFetch.mockResolvedValue({ ok: false, status: 404 })

      const result = await replayQueue()
      expect(result).toEqual({ succeeded: 0, failed: 1 })
      expect(mockStore.has('mut-404')).toBe(false)
    })

    it('increments retry count on transient errors', async () => {
      const mut = makeMutation({ id: 'mut-retry', timestamp: 100, retries: 0, maxRetries: 3 })
      mockStore.set('mut-retry', mut)

      mockFetch.mockResolvedValue({ ok: false, status: 500 })

      const result = await replayQueue()
      expect(result).toEqual({ succeeded: 0, failed: 1 })
      // Mutation should still be in store with incremented retries
      const updated = mockStore.get('mut-retry')
      expect(updated?.retries).toBe(1)
    })

    it('discards mutations at max retries', async () => {
      const mut = makeMutation({ id: 'mut-max', timestamp: 100, retries: 3, maxRetries: 3 })
      mockStore.set('mut-max', mut)

      mockFetch.mockResolvedValue({ ok: false, status: 500 })

      const result = await replayQueue()
      expect(result).toEqual({ succeeded: 0, failed: 1 })
      expect(mockStore.has('mut-max')).toBe(false)
    })

    it('stops replay on network error', async () => {
      mockStore.set('mut-1', makeMutation({ id: 'mut-1', timestamp: 100 }))
      mockStore.set('mut-2', makeMutation({ id: 'mut-2', timestamp: 200 }))

      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await replayQueue()
      // Should break on first network error
      expect(result).toEqual({ succeeded: 0, failed: 0 })
    })

    it('returns zero counts on empty queue', async () => {
      const result = await replayQueue()
      expect(result).toEqual({ succeeded: 0, failed: 0 })
    })
  })
})

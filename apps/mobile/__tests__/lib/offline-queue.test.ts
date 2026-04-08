import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedMutation } from '@orbit/shared/types/sync'

vi.mock('expo-sqlite', () => {
  interface StoredRow {
    id: string
    timestamp: number
    type: string
    endpoint: string
    method: string
    payload: string
    retries: number
    max_retries: number
    meta: string | null
  }

  const rows = new Map<string, StoredRow>()
  const columns = [{ name: 'meta' }]

  return {
    openDatabaseSync: () => ({
      execSync: (sql: string) => {
        if (sql.includes('DELETE FROM mutation_queue')) {
          rows.clear()
        }
      },
      getAllSync: <T,>(sql: string) => {
        if (sql.startsWith('PRAGMA table_info')) {
          return columns as T[]
        }
        if (sql.startsWith('SELECT * FROM mutation_queue')) {
          return Array.from(rows.values()).sort((a, b) => a.timestamp - b.timestamp) as T[]
        }
        return [] as T[]
      },
      runSync: (sql: string, params: unknown[] = []) => {
        if (sql.startsWith('INSERT OR REPLACE INTO mutation_queue')) {
          const [
            id,
            timestamp,
            type,
            endpoint,
            method,
            payload,
            retries,
            maxRetries,
            meta,
          ] = params as [
            string,
            number,
            string,
            string,
            string,
            string,
            number,
            number,
            string | null,
          ]

          rows.set(id, {
            id,
            timestamp,
            type,
            endpoint,
            method,
            payload,
            retries,
            max_retries: maxRetries,
            meta,
          })
          return
        }

        if (sql === 'DELETE FROM mutation_queue') {
          rows.clear()
          return
        }

        if (sql.startsWith('DELETE FROM mutation_queue WHERE id = ?')) {
          rows.delete(String(params[0]))
        }
      },
      getFirstSync: <T,>(sql: string) => {
        if (sql.startsWith('SELECT COUNT(*) as cnt')) {
          return { cnt: rows.size } as T
        }
        return null as T
      },
    }),
  }
})

import {
  clear,
  count,
  dequeue,
  enqueue,
  getAll,
  incrementRetries,
  replaceEntityReferences,
  remove,
  subscribeQueueCount,
  update,
} from '@/lib/offline-queue'

function makeMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: overrides.id ?? `mutation-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? Date.now(),
    type: overrides.type ?? 'createHabit',
    scope: overrides.scope ?? 'habits',
    endpoint: overrides.endpoint ?? '/api/habits',
    method: overrides.method ?? 'POST',
    payload: overrides.payload ?? { title: 'Drink Water' },
    retries: overrides.retries ?? 0,
    maxRetries: overrides.maxRetries ?? 3,
    entityType: overrides.entityType ?? 'habit',
    status: overrides.status ?? 'pending',
    dedupeKey: overrides.dedupeKey ?? null,
    targetEntityId: overrides.targetEntityId ?? null,
    clientEntityId: overrides.clientEntityId ?? null,
    dependsOn: overrides.dependsOn ?? [],
    lastError: overrides.lastError ?? null,
  }
}

describe('mobile offline queue', () => {
  beforeEach(() => {
    clear()
  })

  it('merges updates into a pending create mutation for the same temp entity', () => {
    enqueue(makeMutation({
      id: 'create-1',
      type: 'createHabit',
      clientEntityId: 'offline-habit-1',
      targetEntityId: 'offline-habit-1',
      payload: { title: 'Read' },
    }))

    enqueue(makeMutation({
      id: 'update-1',
      type: 'updateHabit',
      method: 'PUT',
      endpoint: '/api/habits/offline-habit-1',
      targetEntityId: 'offline-habit-1',
      payload: { description: 'Before bed' },
    }))

    const queued = getAll()
    expect(queued).toHaveLength(1)
    expect(queued[0]?.type).toBe('createHabit')
    expect(queued[0]?.payload).toEqual({
      title: 'Read',
      description: 'Before bed',
    })
  })

  it('drops a pending create when the same temp entity is deleted before sync', () => {
    enqueue(makeMutation({
      id: 'create-1',
      type: 'createHabit',
      clientEntityId: 'offline-habit-2',
      targetEntityId: 'offline-habit-2',
    }))

    enqueue(makeMutation({
      id: 'delete-1',
      type: 'deleteHabit',
      method: 'DELETE',
      endpoint: '/api/habits/offline-habit-2',
      targetEntityId: 'offline-habit-2',
      payload: null,
    }))

    expect(getAll()).toHaveLength(0)
  })

  it('keeps only the latest last-write-wins mutation for the same dedupe key', () => {
    enqueue(makeMutation({
      id: 'reorder-1',
      type: 'reorderHabits',
      method: 'PUT',
      dedupeKey: 'habits:reorder',
      payload: { positions: [{ habitId: 'habit-1', position: 0 }] },
    }))

    enqueue(makeMutation({
      id: 'reorder-2',
      type: 'reorderHabits',
      method: 'PUT',
      dedupeKey: 'habits:reorder',
      payload: { positions: [{ habitId: 'habit-1', position: 3 }] },
    }))

    const queued = getAll()
    expect(queued).toHaveLength(1)
    expect(queued[0]?.id).toBe('reorder-2')
    expect(queued[0]?.payload).toEqual({
      positions: [{ habitId: 'habit-1', position: 3 }],
    })
  })

  it('rewrites temp ids across endpoint, payload, target ids, and dependencies', () => {
    enqueue(makeMutation({
      id: 'update-1',
      type: 'updateHabit',
      method: 'PUT',
      endpoint: '/api/habits/offline-habit-3',
      targetEntityId: 'offline-habit-3',
      dependsOn: ['offline-habit-3'],
      payload: {
        habitId: 'offline-habit-3',
        relatedIds: ['offline-habit-3'],
      },
    }))

    replaceEntityReferences('offline-habit-3', 'habit-3')

    const queued = getAll()
    expect(queued[0]?.endpoint).toBe('/api/habits/habit-3')
    expect(queued[0]?.targetEntityId).toBe('habit-3')
    expect(queued[0]?.dependsOn).toEqual(['habit-3'])
    expect(queued[0]?.payload).toEqual({
      habitId: 'habit-3',
      relatedIds: ['habit-3'],
    })
  })

  it('supports dequeue, update, remove, and retry lifecycle helpers', () => {
    enqueue(makeMutation({
      id: 'update-1',
      type: 'updateHabit',
      method: 'PUT',
      endpoint: '/api/habits/habit-1',
      targetEntityId: 'habit-1',
      payload: { title: 'Read' },
    }))

    enqueue(makeMutation({
      id: 'update-2',
      type: 'updateHabit',
      timestamp: Date.now() + 1,
      method: 'PUT',
      endpoint: '/api/habits/habit-2',
      targetEntityId: 'habit-2',
      payload: { title: 'Write' },
    }))

    expect(dequeue()?.id).toBe('update-1')
    expect(count()).toBe(2)

    update('update-1', { status: 'failed', lastError: 'Network request failed' })
    incrementRetries('update-1')

    const updated = getAll().find((mutation) => mutation.id === 'update-1')
    expect(updated).toMatchObject({
      status: 'failed',
      lastError: 'Network request failed',
      retries: 1,
    })

    remove('update-1')

    expect(count()).toBe(1)
    expect(getAll().map((mutation) => mutation.id)).toEqual(['update-2'])
  })

  it('emits queue count changes to subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeQueueCount(listener)

    expect(listener).toHaveBeenLastCalledWith(0)

    enqueue(makeMutation({ id: 'create-1' }))
    expect(listener).toHaveBeenLastCalledWith(1)

    clear()
    expect(listener).toHaveBeenLastCalledWith(0)

    unsubscribe()

    enqueue(makeMutation({ id: 'create-2' }))
    expect(listener).toHaveBeenLastCalledWith(0)
  })
})

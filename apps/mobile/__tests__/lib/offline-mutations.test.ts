import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedMutation } from '@orbit/shared/types/sync'
import { logHabitResponseSchema } from '@orbit/shared/types/habit'

import {
  buildQueuedMutation,
  cancelScheduledFlush,
  flushQueuedMutations,
  queueOrExecute,
  runQueuedMutation,
  subscribeDroppedMutations,
} from '@/lib/offline-mutations'
import { consumePendingIdempotencyKey } from '@/lib/idempotency-key'

const mocks = vi.hoisted(() => {
  const queued: QueuedMutation[] = []
  const resolvedIds = new Map<string, string>()
  let online = false

  function replaceIdInValue(value: unknown, oldId: string, newId: string): unknown {
    if (value === oldId) return newId

    if (Array.isArray(value)) {
      return value.map((entry) => replaceIdInValue(entry, oldId, newId))
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          replaceIdInValue(entry, oldId, newId),
        ]),
      )
    }

    if (typeof value === 'string' && value.includes(oldId)) {
      return value.split(oldId).join(newId)
    }

    return value
  }

  const enqueue = vi.fn((mutation: QueuedMutation) => {
    queued.push(mutation)
  })

  const getAll = vi.fn(() => [...queued])
  const getById = vi.fn((id: string) => queued.find((mutation) => mutation.id === id) ?? null)
  const count = vi.fn(() => queued.length)

  const remove = vi.fn((id: string) => {
    const index = queued.findIndex((mutation) => mutation.id === id)
    if (index >= 0) queued.splice(index, 1)
  })

  const update = vi.fn((id: string, patch: Partial<QueuedMutation>) => {
    const mutation = queued.find((entry) => entry.id === id)
    if (!mutation) return
    Object.assign(mutation, patch)
  })

  const replaceEntityReferences = vi.fn((oldId: string, newId: string) => {
    for (const mutation of queued) {
      mutation.endpoint = mutation.endpoint.includes(oldId)
        ? mutation.endpoint.split(oldId).join(newId)
        : mutation.endpoint
      mutation.payload = replaceIdInValue(mutation.payload, oldId, newId)
      mutation.targetEntityId =
        mutation.targetEntityId === oldId ? newId : mutation.targetEntityId
      mutation.clientEntityId =
        mutation.clientEntityId === oldId ? newId : mutation.clientEntityId
      mutation.dependsOn = mutation.dependsOn?.map((id) => (id === oldId ? newId : id)) ?? []
    }
  })

  const upsertOfflineEntity = vi.fn(async () => {})
  const setOfflineEntityStatus = vi.fn(async () => {})
  const clearOfflineEntity = vi.fn(async () => {})
  const markOfflineTombstone = vi.fn(async () => {})
  const resolveOfflineEntity = vi.fn(async (_entityType: string, oldId: string, newId: string) => {
    resolvedIds.set(oldId, newId)
  })
  const getResolvedEntityId = vi.fn(async (_entityType: string, id: string) => resolvedIds.get(id) ?? id)

  const persistQueryCache = vi.fn(async () => {})
  const invalidateQueries = vi.fn(async () => {})

  const apiClient = vi.fn(async (endpoint: string) => {
    if (endpoint === '/api/habits') {
      return { id: 'habit-1' }
    }

    return null
  })

  const getCurrentConnectivity = vi.fn(async () => online)

  return {
    queued,
    resolvedIds,
    setOnline(value: boolean) {
      online = value
    },
    enqueue,
    getAll,
    getById,
    count,
    remove,
    update,
    replaceEntityReferences,
    upsertOfflineEntity,
    setOfflineEntityStatus,
    clearOfflineEntity,
    markOfflineTombstone,
    resolveOfflineEntity,
    getResolvedEntityId,
    persistQueryCache,
    invalidateQueries,
    apiClient,
    getCurrentConnectivity,
  }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/offline-queue', () => ({
  enqueue: mocks.enqueue,
  getAll: mocks.getAll,
  getById: mocks.getById,
  count: mocks.count,
  remove: mocks.remove,
  update: mocks.update,
  replaceEntityReferences: mocks.replaceEntityReferences,
}))

vi.mock('@/lib/offline-state', () => ({
  upsertOfflineEntity: mocks.upsertOfflineEntity,
  setOfflineEntityStatus: mocks.setOfflineEntityStatus,
  clearOfflineEntity: mocks.clearOfflineEntity,
  markOfflineTombstone: mocks.markOfflineTombstone,
  resolveOfflineEntity: mocks.resolveOfflineEntity,
  getResolvedEntityId: mocks.getResolvedEntityId,
}))

vi.mock('@/lib/offline-runtime', () => ({
  getCurrentConnectivity: mocks.getCurrentConnectivity,
}))

vi.mock('@/lib/query-client', () => ({
  persistQueryCache: mocks.persistQueryCache,
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
  },
}))

describe('offline mutations', () => {
  beforeEach(() => {
    mocks.queued.length = 0
    mocks.resolvedIds.clear()
    mocks.setOnline(false)

    mocks.enqueue.mockClear()
    mocks.getAll.mockClear()
    mocks.getById.mockClear()
    mocks.count.mockClear()
    mocks.remove.mockClear()
    mocks.update.mockClear()
    mocks.replaceEntityReferences.mockClear()
    mocks.upsertOfflineEntity.mockClear()
    mocks.setOfflineEntityStatus.mockClear()
    mocks.clearOfflineEntity.mockClear()
    mocks.markOfflineTombstone.mockClear()
    mocks.resolveOfflineEntity.mockClear()
    mocks.getResolvedEntityId.mockClear()
    mocks.persistQueryCache.mockClear()
    mocks.invalidateQueries.mockClear()
    mocks.apiClient.mockClear()
    mocks.getCurrentConnectivity.mockClear()
    cancelScheduledFlush()
  })

  it('queues a deterministic mutation while offline instead of throwing a network error', async () => {
    const mutation = buildQueuedMutation({
      type: 'createHabit',
      scope: 'habits',
      endpoint: '/api/habits',
      method: 'POST',
      payload: { title: 'Read' },
      entityType: 'habit',
      clientEntityId: 'offline-habit-1',
    })

    const queuedAck = { queued: true as const }
    const result = await queueOrExecute({
      mutation,
      execute: async () => {
        throw new Error('should not execute while offline')
      },
      queuedResult: queuedAck,
    })

    expect(result).toBe(queuedAck)
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(mocks.queued).toHaveLength(1)
    expect(mocks.queued[0]?.clientEntityId).toBe('offline-habit-1')
    expect(mocks.upsertOfflineEntity).toHaveBeenCalledTimes(1)
    expect(mocks.persistQueryCache).toHaveBeenCalledTimes(1)
  })

  it('attaches the mutation id as the idempotency key when flushing a queued mutation', async () => {
    mocks.setOnline(true)
    const mutation = buildQueuedMutation({
      type: 'createHabit',
      scope: 'habits',
      endpoint: '/api/habits',
      method: 'POST',
      payload: { title: 'Read' },
    })
    mocks.queued.push(mutation)

    await flushQueuedMutations()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/habits',
      expect.objectContaining({ idempotencyKey: mutation.id }),
      undefined,
    )
  })

  it('forwards the registered response schema when flushing a schema-backed mutation', async () => {
    mocks.setOnline(true)
    const mutation = buildQueuedMutation({
      type: 'logHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-1/log',
      method: 'POST',
      payload: undefined,
      entityType: 'habit',
      targetEntityId: 'habit-1',
    })
    mocks.queued.push(mutation)

    await flushQueuedMutations()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/habits/habit-1/log',
      expect.objectContaining({ method: 'POST', idempotencyKey: mutation.id }),
      logHabitResponseSchema,
    )
  })

  it('exposes the mutation id as the pending idempotency key during an online execute', async () => {
    mocks.setOnline(true)
    const mutation = buildQueuedMutation({
      type: 'createTag',
      scope: 'tags',
      endpoint: '/api/tags',
      method: 'POST',
      payload: { name: 'Focus' },
    })

    let keyDuringExecute: string | null = null
    await queueOrExecute({
      mutation,
      execute: async () => {
        keyDuringExecute = consumePendingIdempotencyKey()
        return { id: 'tag-1' }
      },
      queuedResult: { queued: true as const },
    })

    expect(keyDuringExecute).toBe(mutation.id)
  })

  it('clears the pending idempotency key after the online execute settles so it cannot leak', async () => {
    mocks.setOnline(true)
    const mutation = buildQueuedMutation({
      type: 'createTag',
      scope: 'tags',
      endpoint: '/api/tags',
      method: 'POST',
      payload: { name: 'Focus' },
    })

    await queueOrExecute({
      mutation,
      execute: async () => ({ id: 'tag-1' }),
      queuedResult: { queued: true as const },
    })

    expect(consumePendingIdempotencyKey()).toBeNull()
  })

  it('returns a queued marker by default when runQueuedMutation defers execution', async () => {
    mocks.setOnline(false)

    const result = await runQueuedMutation({
      mutation: {
        type: 'setLanguage',
        scope: 'profile',
        endpoint: '/api/profile/language',
        method: 'PUT',
        payload: { language: 'en' },
        dedupeKey: 'profile-language',
      },
      execute: async () => undefined,
    })

    expect(result).toMatchObject({
      queued: true,
      queuedMutationId: expect.any(String),
    })
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
  })

  it('queues while online when the target entity still points at an unresolved temp id', async () => {
    mocks.setOnline(true)

    const mutation = buildQueuedMutation({
      type: 'updateHabit',
      scope: 'habits',
      endpoint: '/api/habits/offline-habit-1',
      method: 'PUT',
      payload: { title: 'Read later' },
      entityType: 'habit',
      targetEntityId: 'offline-habit-1',
    })

    const execute = vi.fn(async () => ({ ok: true }))
    const queuedAck = { queued: true as const }

    const result = await queueOrExecute({
      mutation,
      execute,
      queuedResult: queuedAck,
    })

    expect(result).toBe(queuedAck)
    expect(execute).not.toHaveBeenCalled()
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(mocks.persistQueryCache).toHaveBeenCalledTimes(1)
  })

  it('executes create mutations online when only the client entity id is temporary', async () => {
    mocks.setOnline(true)

    const mutation = buildQueuedMutation({
      type: 'createHabit',
      scope: 'habits',
      endpoint: '/api/habits',
      method: 'POST',
      payload: { title: 'Read' },
      entityType: 'habit',
      clientEntityId: 'offline-habit-1',
    })

    const execute = vi.fn(async () => ({ id: 'habit-1' }))

    const result = await queueOrExecute({
      mutation,
      execute,
      queuedResult: { queued: true as const },
    })

    expect(result).toEqual({ id: 'habit-1' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('queues while online when payload references still point at unresolved temp ids', async () => {
    mocks.setOnline(true)

    const mutation = buildQueuedMutation({
      type: 'assignTags',
      scope: 'tags',
      endpoint: '/api/habits/habit-1/tags',
      method: 'PUT',
      payload: { tagIds: ['offline-tag-1'] },
      targetEntityId: 'habit-1',
      dependsOn: ['offline-tag-1'],
    })

    const execute = vi.fn(async () => ({ ok: true }))
    const queuedAck = { queued: true as const }

    const result = await queueOrExecute({
      mutation,
      execute,
      queuedResult: queuedAck,
    })

    expect(result).toBe(queuedAck)
    expect(execute).not.toHaveBeenCalled()
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
  })

  it('rethrows non-transient execution errors instead of queueing them', async () => {
    mocks.setOnline(true)

    const mutation = buildQueuedMutation({
      type: 'updateHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-1',
      method: 'PUT',
      payload: { title: 'Read later' },
      entityType: 'habit',
      targetEntityId: 'habit-1',
    })

    await expect(queueOrExecute({
      mutation,
      execute: async () => {
        throw new Error('Validation failed')
      },
      queuedResult: { queued: true as const },
    })).rejects.toThrow('Validation failed')

    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.persistQueryCache).not.toHaveBeenCalled()
  })

  it('flushes queued creates and rewrites later dependent mutations with the resolved server id', async () => {
    mocks.setOnline(true)

    mocks.queued.push(
      buildQueuedMutation({
        type: 'createHabit',
        scope: 'habits',
        endpoint: '/api/habits',
        method: 'POST',
        payload: { title: 'Read' },
        entityType: 'habit',
        clientEntityId: 'offline-habit-1',
      }),
      buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/offline-habit-1',
        method: 'PUT',
        payload: { title: 'Read later', relatedHabitId: 'offline-habit-1' },
        entityType: 'habit',
        targetEntityId: 'offline-habit-1',
      }),
    )

    const result = await flushQueuedMutations()

    expect(result).toEqual({
      succeeded: 2,
      failed: 0,
      remaining: 0,
      droppedMutations: [],
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(1, '/api/habits', {
      method: 'POST',
      body: JSON.stringify({ title: 'Read' }),
      idempotencyKey: expect.any(String),
    }, undefined)
    expect(mocks.apiClient).toHaveBeenNthCalledWith(2, '/api/habits/habit-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Read later', relatedHabitId: 'habit-1' }),
      idempotencyKey: expect.any(String),
    }, undefined)

    expect(mocks.resolveOfflineEntity).toHaveBeenCalledWith('habit', 'offline-habit-1', 'habit-1')
    expect(mocks.replaceEntityReferences).toHaveBeenCalledWith('offline-habit-1', 'habit-1')
    expect(mocks.remove).toHaveBeenCalledTimes(2)
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it('flushes payload-only dependencies after earlier offline ids are rewritten', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/tags') {
        return { id: 'tag-1' }
      }

      return null
    })

    mocks.queued.push(
      buildQueuedMutation({
        type: 'createTag',
        scope: 'tags',
        endpoint: '/api/tags',
        method: 'POST',
        payload: { name: 'Focus', color: '#00ff00' },
        entityType: 'tag',
        clientEntityId: 'offline-tag-1',
      }),
      buildQueuedMutation({
        type: 'assignTags',
        scope: 'tags',
        endpoint: '/api/habits/habit-1/tags',
        method: 'PUT',
        payload: { tagIds: ['offline-tag-1'] },
        targetEntityId: 'habit-1',
        dependsOn: ['offline-tag-1'],
      }),
    )

    const result = await flushQueuedMutations()

    expect(result).toEqual({
      succeeded: 2,
      failed: 0,
      remaining: 0,
      droppedMutations: [],
    })
    expect(mocks.apiClient).toHaveBeenNthCalledWith(1, '/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'Focus', color: '#00ff00' }),
      idempotencyKey: expect.any(String),
    }, undefined)
    expect(mocks.apiClient).toHaveBeenNthCalledWith(2, '/api/habits/habit-1/tags', {
      method: 'PUT',
      body: JSON.stringify({ tagIds: ['tag-1'] }),
      idempotencyKey: expect.any(String),
    }, undefined)
  })

  it('stops flushing on unauthorized errors and leaves the remaining queue intact', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockRejectedValueOnce(new Error('Unauthorized'))

    const firstMutation = {
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1',
        method: 'PUT',
        payload: { title: 'Blocked' },
        entityType: 'habit',
        targetEntityId: 'habit-1',
      }),
      id: 'update-1',
    }

    const secondMutation = {
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-2',
        method: 'PUT',
        payload: { title: 'Still queued' },
        entityType: 'habit',
        targetEntityId: 'habit-2',
      }),
      id: 'update-2',
    }

    mocks.queued.push(
      firstMutation,
      secondMutation,
    )

    const result = await flushQueuedMutations()

    expect(result).toEqual({
      succeeded: 0,
      failed: 1,
      remaining: 2,
      droppedMutations: [],
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(firstMutation.id, {
      retries: 1,
      status: 'failed',
      lastError: 'Unauthorized',
    })
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('drops a validation-rejected mutation, keeps flushing the rest, and reports the dropped one', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/habits/habit-bad') {
        throw new Error('400 validation failed')
      }
      return { id: 'habit-good' }
    })

    const droppedCandidate = {
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-bad',
        method: 'PUT',
        payload: { title: 'Rejected' },
        entityType: 'habit',
        clientEntityId: 'offline-habit-bad',
      }),
      id: 'update-bad',
    }

    const survivor = {
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-good',
        method: 'PUT',
        payload: { title: 'Accepted' },
        entityType: 'habit',
        targetEntityId: 'habit-good',
      }),
      id: 'update-good',
    }

    mocks.queued.push(droppedCandidate, survivor)

    const result = await flushQueuedMutations()

    expect(result).toEqual({
      succeeded: 1,
      failed: 1,
      remaining: 0,
      droppedMutations: [
        { id: 'update-bad', type: 'updateHabit', lastError: '400 validation failed' },
      ],
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      1,
      '/api/habits/habit-bad',
      expect.objectContaining({ method: 'PUT' }),
      undefined,
    )
    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      2,
      '/api/habits/habit-good',
      expect.objectContaining({ method: 'PUT' }),
      undefined,
    )

    expect(mocks.remove).toHaveBeenCalledWith('update-bad')
    expect(mocks.remove).toHaveBeenCalledWith('update-good')
    expect(mocks.clearOfflineEntity).toHaveBeenCalledWith('habit', 'offline-habit-bad')
    expect(mocks.queued).toHaveLength(0)
  })

  it('notifies subscribers on every dropped mutation and stops after unsubscribe', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockImplementation(async () => {
      throw new Error('400 validation failed')
    })

    const dropped: Array<{ id: string; type: string }> = []
    const unsubscribe = subscribeDroppedMutations((drop) => {
      dropped.push({ id: drop.id, type: drop.type })
    })

    mocks.queued.push({
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-bad',
        method: 'PUT',
        payload: { title: 'Rejected' },
        entityType: 'habit',
        clientEntityId: 'offline-habit-bad',
      }),
      id: 'notify-bad',
    })

    await flushQueuedMutations()

    expect(dropped).toEqual([{ id: 'notify-bad', type: 'updateHabit' }])

    unsubscribe()
    dropped.length = 0
    mocks.queued.push({
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-bad-2',
        method: 'PUT',
        payload: { title: 'Rejected again' },
        entityType: 'habit',
        clientEntityId: 'offline-habit-bad-2',
      }),
      id: 'notify-bad-2',
    })

    await flushQueuedMutations()

    expect(dropped).toEqual([])
  })

  describe('transient-failure backoff', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      cancelScheduledFlush()
      vi.useRealTimers()
    })

    it('schedules a backoff re-flush after a transient network failure and recovers', async () => {
      mocks.setOnline(true)
      mocks.apiClient.mockRejectedValueOnce(new Error('Network request failed'))

      mocks.queued.push({
        ...buildQueuedMutation({
          type: 'updateHabit',
          scope: 'habits',
          endpoint: '/api/habits/habit-1',
          method: 'PUT',
          payload: { title: 'Retry me' },
          entityType: 'habit',
          targetEntityId: 'habit-1',
        }),
        id: 'update-1',
      })

      const firstRun = await flushQueuedMutations()
      expect(firstRun).toEqual({ succeeded: 0, failed: 0, remaining: 1, droppedMutations: [] })
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(2)
      expect(mocks.queued).toHaveLength(0)
    })

    it('cancelScheduledFlush prevents a pending retry from firing', async () => {
      mocks.setOnline(true)
      mocks.apiClient.mockRejectedValue(new Error('Network request failed'))

      mocks.queued.push({
        ...buildQueuedMutation({
          type: 'updateHabit',
          scope: 'habits',
          endpoint: '/api/habits/habit-1',
          method: 'PUT',
          payload: { title: 'Retry me' },
          entityType: 'habit',
          targetEntityId: 'habit-1',
        }),
        id: 'update-1',
      })

      await flushQueuedMutations()
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)

      cancelScheduledFlush()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    })
  })

  describe('stress replay, crash recovery, timeout, and dependency ordering', () => {
    it('replays 120 queued mutations in enqueue order, applying every one with none dropped', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      mocks.apiClient.mockImplementation(async (endpoint: string) => {
        flushOrder.push(endpoint)
        return null
      })

      const total = 120
      const expectedOrder: string[] = []
      for (let index = 0; index < total; index += 1) {
        const endpoint = `/api/habits/habit-${index}`
        expectedOrder.push(endpoint)
        mocks.queued.push({
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint,
            method: 'PUT',
            payload: { title: `Habit ${index}` },
            entityType: 'habit',
            targetEntityId: `habit-${index}`,
          }),
          id: `update-${index}`,
        })
      }

      const result = await flushQueuedMutations()

      expect(result).toEqual({ succeeded: total, failed: 0, remaining: 0, droppedMutations: [] })
      expect(flushOrder).toEqual(expectedOrder)
      expect(mocks.queued).toHaveLength(0)
    })

    it('resumes a flush interrupted by a mid-batch network drop without re-applying already-synced mutations', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      let dropThirdOnce = true
      mocks.apiClient.mockImplementation(async (endpoint: string) => {
        flushOrder.push(endpoint)
        if (endpoint === '/api/habits/habit-c' && dropThirdOnce) {
          dropThirdOnce = false
          throw new Error('Network request failed')
        }
        return null
      })

      for (const suffix of ['a', 'b', 'c', 'd']) {
        mocks.queued.push({
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint: `/api/habits/habit-${suffix}`,
            method: 'PUT',
            payload: { title: suffix },
            entityType: 'habit',
            targetEntityId: `habit-${suffix}`,
          }),
          id: `update-${suffix}`,
        })
      }

      const interrupted = await flushQueuedMutations()

      expect(interrupted).toEqual({ succeeded: 2, failed: 0, remaining: 2, droppedMutations: [] })
      expect(mocks.queued.map((mutation) => mutation.id)).toEqual(['update-c', 'update-d'])
      expect(mocks.queued.find((mutation) => mutation.id === 'update-c')?.status).toBe('failed')
      expect(mocks.queued.find((mutation) => mutation.id === 'update-d')?.status).toBe('pending')

      const resumed = await flushQueuedMutations()

      expect(resumed).toEqual({ succeeded: 2, failed: 0, remaining: 0, droppedMutations: [] })
      expect(flushOrder).toEqual([
        '/api/habits/habit-a',
        '/api/habits/habit-b',
        '/api/habits/habit-c',
        '/api/habits/habit-c',
        '/api/habits/habit-d',
      ])
      expect(mocks.queued).toHaveLength(0)
    })

    it('keeps unacknowledged mutations queued and unsent when a flush times out mid-batch', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      mocks.apiClient.mockImplementation(async (endpoint: string) => {
        flushOrder.push(endpoint)
        if (endpoint === '/api/habits/habit-slow') {
          throw new Error('The request timed out')
        }
        return null
      })

      mocks.queued.push(
        {
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint: '/api/habits/habit-fast',
            method: 'PUT',
            payload: { title: 'Fast' },
            entityType: 'habit',
            targetEntityId: 'habit-fast',
          }),
          id: 'update-fast',
        },
        {
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint: '/api/habits/habit-slow',
            method: 'PUT',
            payload: { title: 'Slow' },
            entityType: 'habit',
            targetEntityId: 'habit-slow',
          }),
          id: 'update-slow',
        },
        {
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint: '/api/habits/habit-tail',
            method: 'PUT',
            payload: { title: 'Tail' },
            entityType: 'habit',
            targetEntityId: 'habit-tail',
          }),
          id: 'update-tail',
        },
      )

      const result = await flushQueuedMutations()

      expect(result).toEqual({ succeeded: 1, failed: 0, remaining: 2, droppedMutations: [] })
      expect(flushOrder).toEqual(['/api/habits/habit-fast', '/api/habits/habit-slow'])

      const timedOut = mocks.queued.find((mutation) => mutation.id === 'update-slow')
      expect(timedOut?.status).toBe('failed')
      expect(timedOut?.lastError).toContain('timed out')
      expect(timedOut?.retries).toBe(0)

      const untouched = mocks.queued.find((mutation) => mutation.id === 'update-tail')
      expect(untouched?.status).toBe('pending')

      cancelScheduledFlush()
    })

    it('defers a dependent mutation until its offline dependency resolves, even when queued ahead of the create', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      mocks.apiClient.mockImplementation(async (endpoint: string) => {
        flushOrder.push(endpoint)
        if (endpoint === '/api/tags') return { id: 'tag-1' }
        return null
      })

      mocks.queued.push(
        {
          ...buildQueuedMutation({
            type: 'assignTags',
            scope: 'tags',
            endpoint: '/api/habits/habit-1/tags',
            method: 'PUT',
            payload: { tagIds: ['offline-tag-1'] },
            targetEntityId: 'habit-1',
            dependsOn: ['offline-tag-1'],
          }),
          id: 'assign-1',
        },
        {
          ...buildQueuedMutation({
            type: 'createTag',
            scope: 'tags',
            endpoint: '/api/tags',
            method: 'POST',
            payload: { name: 'Focus' },
            entityType: 'tag',
            clientEntityId: 'offline-tag-1',
          }),
          id: 'create-1',
        },
      )

      const firstPass = await flushQueuedMutations()

      expect(firstPass).toEqual({ succeeded: 1, failed: 0, remaining: 1, droppedMutations: [] })
      expect(flushOrder).toEqual(['/api/tags'])
      expect(mocks.apiClient).not.toHaveBeenCalledWith('/api/habits/habit-1/tags', expect.anything())

      const deferred = mocks.queued.find((mutation) => mutation.id === 'assign-1')
      expect(deferred?.status).toBe('pending')
      expect(deferred?.payload).toEqual({ tagIds: ['tag-1'] })

      const secondPass = await flushQueuedMutations()

      expect(secondPass).toEqual({ succeeded: 1, failed: 0, remaining: 0, droppedMutations: [] })
      expect(flushOrder).toEqual(['/api/tags', '/api/habits/habit-1/tags'])
      expect(mocks.apiClient).toHaveBeenLastCalledWith('/api/habits/habit-1/tags', {
        method: 'PUT',
        body: JSON.stringify({ tagIds: ['tag-1'] }),
        idempotencyKey: 'assign-1',
      }, undefined)
      expect(mocks.queued).toHaveLength(0)
    })
  })
})

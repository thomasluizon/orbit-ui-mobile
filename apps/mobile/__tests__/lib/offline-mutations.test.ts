import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedMutation } from '@orbit/shared/types/sync'

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

import {
  buildQueuedMutation,
  flushQueuedMutations,
  queueOrExecute,
  runQueuedMutation,
} from '@/lib/offline-mutations'

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
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(1, '/api/habits', {
      method: 'POST',
      body: JSON.stringify({ title: 'Read' }),
    })
    expect(mocks.apiClient).toHaveBeenNthCalledWith(2, '/api/habits/habit-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Read later', relatedHabitId: 'habit-1' }),
    })

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
    })
    expect(mocks.apiClient).toHaveBeenNthCalledWith(1, '/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'Focus', color: '#00ff00' }),
    })
    expect(mocks.apiClient).toHaveBeenNthCalledWith(2, '/api/habits/habit-1/tags', {
      method: 'PUT',
      body: JSON.stringify({ tagIds: ['tag-1'] }),
    })
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
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(firstMutation.id, {
      retries: 1,
      status: 'failed',
      lastError: 'Unauthorized',
    })
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})

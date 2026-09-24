import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import type {
  MutationType,
  PersistedQueuedMutation,
  QueuedMutation,
} from '@orbit/shared/types/sync'
import { logHabitResponseSchema } from '@orbit/shared/types/habit'
import { calendarKeys, habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared/utils'

import {
  buildQueuedMutation,
  canAutoFlush,
  cancelScheduledFlush,
  createQueuedAck,
  createTempEntityId,
  flushQueuedMutations,
  getReplayState,
  getMutationScope,
  isAutomaticReplayBlocked,
  isQueuedResult,
  OfflineMutationPreflightError,
  queueOrExecute,
  resumeOfflineReplay,
  runQueuedMutation,
  subscribeDroppedMutations,
  subscribeFlushResults,
  subscribeReplayState,
  withQueuedMarker,
} from '@/lib/offline-mutations'
import { captureError } from '@/lib/sentry'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { consumePendingIdempotencyKey } from '@/lib/idempotency-key'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mocks = vi.hoisted(() => {
  const queued: PersistedQueuedMutation[] = []
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
    return mutation.id
  })

  const getAll = vi.fn(() => [...queued])
  const getById = vi.fn((id: string) => queued.find((mutation) => mutation.id === id) ?? null)
  const findUnfinalizedFirstWrite = vi.fn((mutation: QueuedMutation) =>
    mutation.type === 'logHabit' && mutation.dedupeKey
      ? queued.find((queuedMutation) =>
          queuedMutation.type === mutation.type &&
          queuedMutation.dedupeKey === mutation.dedupeKey,
        ) ?? null
      : null,
  )
  const count = vi.fn(() => queued.length)

  const remove = vi.fn((id: string) => {
    const index = queued.findIndex((mutation) => mutation.id === id)
    if (index >= 0) queued.splice(index, 1)
  })

  const update = vi.fn((id: string, patch: Partial<PersistedQueuedMutation>) => {
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

  const upsertOfflineEntity = vi.fn(() => Promise.resolve())
  const setOfflineEntityStatus = vi.fn(() => Promise.resolve())
  const clearOfflineEntity = vi.fn(() => Promise.resolve())
  const markOfflineTombstone = vi.fn(() => Promise.resolve())
  const resolveOfflineEntity = vi.fn((_entityType: string, oldId: string, newId: string) => {
    resolvedIds.set(oldId, newId)
    return Promise.resolve()
  })
  const getResolvedEntityId = vi.fn((_entityType: string, id: string) =>
    Promise.resolve(resolvedIds.get(id) ?? id),
  )

  const persistQueryCache = vi.fn(() => Promise.resolve())
  const cancelQueries = vi.fn(() => Promise.resolve())
  const invalidateQueries = vi.fn(() => Promise.resolve())
  const setQueryData = vi.fn()

  const apiClient = vi.fn((endpoint: string): Promise<{ id: string } | null> => {
    if (endpoint === '/api/habits') {
      return Promise.resolve({ id: 'habit-1' })
    }

    return Promise.resolve(null)
  })

  const getCurrentConnectivity = vi.fn(() => Promise.resolve(online))
  const captureError = vi.fn()

  return {
    queued,
    resolvedIds,
    setOnline(value: boolean) {
      online = value
    },
    enqueue,
    getAll,
    getById,
    findUnfinalizedFirstWrite,
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
    cancelQueries,
    invalidateQueries,
    setQueryData,
    apiClient,
    getCurrentConnectivity,
    captureError,
  }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/lib/offline-queue', () => ({
  enqueue: mocks.enqueue,
  getAll: mocks.getAll,
  getById: mocks.getById,
  findUnfinalizedFirstWrite: mocks.findUnfinalizedFirstWrite,
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
    cancelQueries: mocks.cancelQueries,
    invalidateQueries: mocks.invalidateQueries,
    setQueryData: mocks.setQueryData,
    getQueriesData: vi.fn(() => []),
  },
}))

vi.mock('@/lib/sentry', () => ({
  captureError: mocks.captureError,
}))

const nativeSetImmediate = setImmediate

async function waitForCapturedError(maximumMacrotasks = 20): Promise<void> {
  for (let tick = 0; tick < maximumMacrotasks; tick += 1) {
    if (mocks.captureError.mock.calls.length > 0) return
    await new Promise<void>((resolve) => nativeSetImmediate(resolve))
    await vi.advanceTimersByTimeAsync(1)
  }
}

describe('offline mutations', () => {
  beforeEach(() => {
    mocks.queued.length = 0
    mocks.resolvedIds.clear()
    mocks.setOnline(false)

    mocks.enqueue.mockClear()
    mocks.getAll.mockClear()
    mocks.getById.mockClear()
    mocks.findUnfinalizedFirstWrite.mockClear()
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
    mocks.cancelQueries.mockClear()
    mocks.invalidateQueries.mockClear()
    mocks.setQueryData.mockClear()
    mocks.apiClient.mockReset()
    mocks.apiClient.mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint === '/api/habits' ? { id: 'habit-1' } : null),
    )
    mocks.getCurrentConnectivity.mockClear()
    mocks.captureError.mockClear()
    useOfflineSyncStore.setState({ drops: [] })
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
      execute: () => Promise.reject(new Error('should not execute while offline')),
      queuedResult: queuedAck,
    })

    expect(result).toBe(queuedAck)
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(mocks.queued).toHaveLength(1)
    expect(mocks.queued[0]?.clientEntityId).toBe('offline-habit-1')
    expect(mocks.upsertOfflineEntity).toHaveBeenCalledTimes(1)
    expect(mocks.persistQueryCache).toHaveBeenCalledTimes(1)
  })

  it('invalidates search pages after replaying an offline tag rename', async () => {
    const mutation = buildQueuedMutation({ type: 'updateTag', scope: 'tags', endpoint: API.tags.update('tag-1'), method: 'PUT', payload: { name: 'Focus', color: '#00ff00' } })
    await queueOrExecute({ mutation, execute: vi.fn(), queuedResult: { queued: true as const } })
    mocks.setOnline(true)
    await flushQueuedMutations()
    expect(mocks.queued).toHaveLength(0)
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.searches() })
  })

  it('builds the queued result from the retained durable mutation id', async () => {
    const mutation = buildQueuedMutation({
      type: 'logHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-1/log',
      method: 'POST',
      payload: { date: '2026-08-29' },
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    })
    mocks.enqueue.mockImplementationOnce((queuedMutation) => {
      mocks.queued.push(queuedMutation)
      return 'persisted-log'
    })

    const result = await queueOrExecute({
      mutation,
      execute: () => Promise.reject(new Error('should not execute while offline')),
      queuedResultFactory: createQueuedAck,
    })

    expect(result).toEqual({
      queued: true,
      queuedMutationId: 'persisted-log',
    })
  })

  it('marks a coalesced online toggle as a retained acknowledgement', async () => {
    mocks.setOnline(true)
    const retainedMutation = buildQueuedMutation({
      type: 'logHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-1/log',
      method: 'POST',
      payload: { date: '2026-08-29' },
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    })
    retainedMutation.status = 'syncing'
    mocks.queued.push(retainedMutation)
    const execute = vi.fn(() => Promise.resolve(null))

    const result = await queueOrExecute({
      mutation: buildQueuedMutation({
        type: 'logHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1/log',
        method: 'POST',
        payload: { date: '2026-08-29' },
        dedupeKey: 'habit-toggle:habit-1:2026-08-29',
        targetEntityId: 'habit-1',
      }),
      execute,
      queuedResultFactory: createQueuedAck,
    })

    expect(result).toEqual({
      queued: true,
      queuedMutationId: retainedMutation.id,
      retained: true,
    })
    expect(execute).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.queued).toEqual([retainedMutation])
  })

  it.each([
    ['bulkLogHabits', '/api/habits/bulk-log', 'POST'],
    ['bulkSkipHabits', '/api/habits/bulk-skip', 'POST'],
    ['bulkCascadeDeleteHabits', '/api/habits/habit-1', 'DELETE'],
  ] as const)('refuses offline %s without persisting it', async (type, endpoint, method) => {
    const execute = vi.fn(() => Promise.resolve(null))

    await expect(queueOrExecute({
      mutation: buildQueuedMutation({
        type,
        scope: 'habits',
        endpoint,
        method,
        payload: { habitIds: ['habit-1'] },
      }),
      execute,
      queuedResult: { queued: true as const },
    })).rejects.toBeInstanceOf(OfflineMutationPreflightError)

    expect(execute).not.toHaveBeenCalled()
    expect(isAutomaticReplayBlocked(type)).toBe(true)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.queued).toEqual([])
    expect(mocks.persistQueryCache).not.toHaveBeenCalled()
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
      execute: () => {
        keyDuringExecute = consumePendingIdempotencyKey()
        return Promise.resolve({ id: 'tag-1' })
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
      execute: () => Promise.resolve({ id: 'tag-1' }),
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
      execute: () => Promise.resolve(undefined),
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

    const execute = vi.fn(() => Promise.resolve({ ok: true }))
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

    const execute = vi.fn(() => Promise.resolve({ id: 'habit-1' }))

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

    const execute = vi.fn(() => Promise.resolve({ ok: true }))
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
      execute: () => Promise.reject(new Error('Validation failed')),
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
      replayState: 'idle',
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
    mocks.apiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/tags') {
        return Promise.resolve({ id: 'tag-1' })
      }

      return Promise.resolve(null)
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
      replayState: 'idle',
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
    vi.useFakeTimers()
    mocks.setOnline(true)
    mocks.apiClient.mockRejectedValue(new Error('Unauthorized'))

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
      replayState: 'stopped-for-auth',
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(firstMutation.id, {
      status: 'failed',
      lastError: 'Unauthorized',
    })
    expect(firstMutation.retries).toBe(0)
    expect(mocks.remove).not.toHaveBeenCalled()
    const queuedAfterStop = structuredClone(mocks.queued)
    try {
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      expect(mocks.queued).toEqual(queuedAfterStop)
      expect(vi.getTimerCount()).toBe(0)
      expect(getReplayState()).toBe('stopped-for-auth')
      expect(canAutoFlush()).toBe(false)
    } finally {
      cancelScheduledFlush()
      vi.useRealTimers()
    }
  })

  it('reopens retained work after the authenticated session recovers', async () => {
    mocks.setOnline(true)
    mocks.apiClient
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValueOnce(null)
    mocks.queued.push({
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1',
        method: 'PUT',
        payload: { title: 'Retained' },
      }),
      id: 'retained-auth-row',
    })

    const stopped = await flushQueuedMutations()
    expect(stopped.replayState).toBe('stopped-for-auth')
    expect(getReplayState()).toBe('stopped-for-auth')
    expect(canAutoFlush()).toBe(false)

    resumeOfflineReplay()
    expect(canAutoFlush()).toBe(true)
    const resumed = await flushQueuedMutations()

    expect(resumed.replayState).toBe('idle')
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(mocks.queued).toHaveLength(0)
  })

  it('serializes concurrent flushes and honors cancellation through completion', async () => {
    mocks.setOnline(true)
    let resolveDelivery: ((value: null) => void) | undefined
    mocks.apiClient.mockImplementationOnce(
      () => new Promise<null>((resolve) => {
        resolveDelivery = resolve
      }),
    )
    mocks.queued.push({
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1',
        method: 'PUT',
        payload: { title: 'One delivery' },
      }),
      id: 'single-flight',
    })

    const activeFlush = flushQueuedMutations()
    await Promise.resolve()
    const concurrentResult = await flushQueuedMutations()

    expect(concurrentResult.replayState).toBe('flushing')
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    cancelScheduledFlush()
    resolveDelivery?.(null)
    const completedResult = await activeFlush

    expect(completedResult.replayState).toBe('idle')
    expect(canAutoFlush()).toBe(true)
  })

  it('keeps a cancelled rejected flush idle with retained work', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockRejectedValueOnce(new Error('Network request failed'))
    let rejectPersistence: ((error: Error) => void) | undefined
    mocks.persistQueryCache.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => {
        rejectPersistence = reject
      }),
    )
    mocks.queued.push({
      ...buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1',
        method: 'PUT',
        payload: { title: 'Retained' },
      }),
      id: 'cancelled-rejection',
    })

    const activeFlush = flushQueuedMutations()
    await new Promise<void>((resolve) => nativeSetImmediate(resolve))
    cancelScheduledFlush()
    rejectPersistence?.(new Error('Queue persistence failed'))

    await expect(activeFlush).rejects.toThrow('Queue persistence failed')
    expect(mocks.queued).toHaveLength(1)
    expect(canAutoFlush()).toBe(true)
  })

  it('drops a validation-rejected mutation, keeps flushing the rest, and reports the dropped one', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/habits/habit-bad') {
        return Promise.reject(new Error('400 validation failed'))
      }
      return Promise.resolve({ id: 'habit-good' })
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

    expect(result).toMatchObject({
      succeeded: 1,
      failed: 1,
      remaining: 0,
      droppedMutations: [
        { id: 'update-bad', type: 'updateHabit', lastError: '400 validation failed', mutation: droppedCandidate },
      ],
      replayState: 'idle',
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

  it('replays a retired persisted operation without current-scope invalidation', async () => {
    mocks.setOnline(true)
    const retiredType = ['delete', 'User', 'Fact'].join('')
    const endpoint = ['/api/user', '-facts/retired'].join('')
    mocks.queued.push({
      id: 'retired-operation',
      timestamp: Date.now(),
      type: retiredType,
      endpoint,
      method: 'DELETE',
      payload: null,
      retries: 0,
      maxRetries: 3,
      status: 'pending',
      dependsOn: [],
    })

    const result = await flushQueuedMutations()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: 'DELETE' }),
      undefined,
    )
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
    expect(result).toEqual({
      succeeded: 1,
      failed: 0,
      remaining: 0,
      droppedMutations: [],
      replayState: 'idle',
    })
  })

  it('refreshes the persisted profile before invalidating gamification after replay', async () => {
    mocks.setOnline(true)
    mocks.queued.push(buildQueuedMutation({
      type: 'setTimeZone',
      scope: 'profile',
      endpoint: '/api/profile/timezone',
      method: 'PUT',
      payload: { timeZone: 'Pacific/Kiritimati' },
    }))

    await flushQueuedMutations()

    expect(mocks.cancelQueries).toHaveBeenCalledWith({ queryKey: calendarKeys.all })
    expect(mocks.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: calendarKeys.all }],
      [{ queryKey: ['profile'] }],
      [{ queryKey: ['gamification'], refetchType: 'none' }],
    ])
    expect(mocks.setQueryData).toHaveBeenCalledWith(['profile', 'detail'], expect.any(Function))
  })

  it('drops a rejected retired operation without classifying it as a current scope', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockRejectedValue(new Error('400 validation failed'))
    const retiredType = ['bulkDelete', 'User', 'Facts'].join('')
    mocks.queued.push({
      id: 'retired-rejected-operation',
      timestamp: Date.now(),
      type: retiredType,
      endpoint: ['/api/user', '-facts/bulk'].join(''),
      method: 'DELETE',
      payload: null,
      retries: 0,
      maxRetries: 3,
      status: 'pending',
      dependsOn: [],
    })

    const result = await flushQueuedMutations()

    expect(getMutationScope(retiredType)).toBeUndefined()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
    expect(result.droppedMutations).toMatchObject([
      {
        id: 'retired-rejected-operation',
        type: retiredType,
        lastError: '400 validation failed',
      },
    ])
  })

  it('notifies subscribers on every dropped mutation and stops after unsubscribe', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockImplementation(() =>
      Promise.reject(new Error('400 validation failed')),
    )

    const dropped: { id: string; type: string }[] = []
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

  it('publishes each completed flush result only to current subscribers', async () => {
    mocks.setOnline(true)
    const results: { succeeded: number; remaining: number }[] = []
    const unsubscribe = subscribeFlushResults((result) => {
      results.push({ succeeded: result.succeeded, remaining: result.remaining })
    })
    mocks.queued.push(buildQueuedMutation({
      type: 'updateHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-1',
      method: 'PUT',
      payload: { title: 'First' },
    }))

    await flushQueuedMutations()

    expect(results).toEqual([{ succeeded: 1, remaining: 0 }])
    unsubscribe()
    mocks.queued.push(buildQueuedMutation({
      type: 'updateHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-2',
      method: 'PUT',
      payload: { title: 'Second' },
    }))

    await flushQueuedMutations()

    expect(results).toEqual([{ succeeded: 1, remaining: 0 }])
  })

  it('rewrites nested array, object, and substring references when a temp id resolves online', async () => {
    mocks.setOnline(true)
    mocks.resolvedIds.set('offline-habit-1', 'habit-1')

    const mutation = buildQueuedMutation({
      type: 'updateHabit',
      scope: 'habits',
      endpoint: '/api/habits/offline-habit-1',
      method: 'PUT',
      payload: {
        related: ['offline-habit-1', { nested: 'offline-habit-1' }],
        note: 'see offline-habit-1 for details',
        order: 3,
        cleared: null,
      },
      entityType: 'habit',
      targetEntityId: 'offline-habit-1',
      clientEntityId: 'offline-habit-1',
      dependsOn: ['offline-habit-1'],
    })

    let executedWith: QueuedMutation | null = null
    await queueOrExecute({
      mutation,
      execute: (resolved) => {
        executedWith = resolved
        return Promise.resolve({ ok: true })
      },
      queuedResult: { queued: true as const },
    })

    expect(executedWith).not.toBeNull()
    const resolved = executedWith as unknown as QueuedMutation
    expect(resolved.endpoint).toBe('/api/habits/habit-1')
    expect(resolved.targetEntityId).toBe('habit-1')
    expect(resolved.clientEntityId).toBe('habit-1')
    expect(resolved.dependsOn).toEqual(['habit-1'])
    expect(resolved.payload).toEqual({
      related: ['habit-1', { nested: 'habit-1' }],
      note: 'see habit-1 for details',
      order: 3,
      cleared: null,
    })
  })

  it('queues an online mutation when the execute fails with a transient network error', async () => {
    mocks.setOnline(true)
    const queuedAck = { queued: true as const }

    const result = await queueOrExecute({
      mutation: buildQueuedMutation({
        type: 'updateHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1',
        method: 'PUT',
        payload: { title: 'Retry' },
      }),
      execute: () => Promise.reject(new TypeError('Network request failed')),
      queuedResult: queuedAck,
    })

    expect(result).toBe(queuedAck)
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
  })

  it('does not persist a non-replayable mutation after an online network failure', async () => {
    mocks.setOnline(true)

    await expect(queueOrExecute({
      mutation: buildQueuedMutation({
        type: 'bulkLogHabits',
        scope: 'habits',
        endpoint: '/api/habits/bulk-log',
        method: 'POST',
        payload: { items: [{ habitId: 'habit-1' }] },
      }),
      execute: () => Promise.reject(new TypeError('Network request failed')),
      queuedResult: { queued: true as const },
    })).rejects.toThrow('Network request failed')

    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.queued).toEqual([])
  })

  it.each([
    ['bulkSkipHabits', 'released-bulk-skip', '/api/habits/bulk-skip'],
    ['bulkLogHabits', 'released-bulk-log', '/api/habits/bulk-log'],
    ['bulkCascadeDeleteHabits', 'released-cascade-delete', '/api/habits/habit-1'],
  ] as const)(
    'retires a released-format %s row without network execution',
    async (type, id, endpoint) => {
      const dropped: { id: string; type: string; lastError: string | null }[] = []
      const unsubscribe = subscribeDroppedMutations((mutation) => dropped.push(mutation))
      mocks.queued.push({
        ...buildQueuedMutation({
          type,
          scope: 'habits',
          endpoint,
          method: type === 'bulkCascadeDeleteHabits' ? 'DELETE' : 'POST',
          payload: type === 'bulkCascadeDeleteHabits'
            ? null
            : { items: [{ habitId: 'habit-1' }] },
        }),
        id,
      })
      mocks.setOnline(true)

      const result = await flushQueuedMutations()
      unsubscribe()

      expect(mocks.apiClient).not.toHaveBeenCalled()
      expect(result).toEqual({
        succeeded: 0,
        failed: 1,
        remaining: 0,
        droppedMutations: [{
          id,
          type,
          lastError: 'Automatic replay is blocked for this mutation while offline',
          mutation: expect.objectContaining({ type }),
        }],
        replayState: 'idle',
      })
      expect(dropped).toEqual(result.droppedMutations)
    },
  )

  it('keeps released-format single deletes replayable', async () => {
    const mutation = {
      ...buildQueuedMutation({
        type: 'deleteHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-1',
        method: 'DELETE',
        payload: null,
        targetEntityId: 'habit-1',
      }),
      id: 'released-delete-habit',
    }
    mocks.queued.push(mutation)
    mocks.setOnline(true)

    const result = await flushQueuedMutations()

    expect(isAutomaticReplayBlocked('deleteHabit')).toBe(false)
    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/habits/habit-1',
      expect.objectContaining({ idempotencyKey: mutation.id }),
      undefined,
    )
    expect(result).toEqual({
      succeeded: 1,
      failed: 0,
      remaining: 0,
      droppedMutations: [],
      replayState: 'idle',
    })
  })

  it('marks a tombstone when a delete mutation is queued offline', async () => {
    mocks.setOnline(false)

    await queueOrExecute({
      mutation: buildQueuedMutation({
        type: 'deleteHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-7',
        method: 'DELETE',
        payload: undefined,
        entityType: 'habit',
        targetEntityId: 'habit-7',
      }),
      execute: () => Promise.resolve(undefined),
      queuedResult: { queued: true as const },
    })

    expect(mocks.markOfflineTombstone).toHaveBeenCalledWith('habit', 'habit-7', true)
  })

  it('clears the temp entity when a flushed create returns no server id', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockResolvedValue({ id: '' })

    mocks.queued.push(
      buildQueuedMutation({
        type: 'createHabit',
        scope: 'habits',
        endpoint: '/api/habits',
        method: 'POST',
        payload: { title: 'Read' },
        entityType: 'habit',
        clientEntityId: 'offline-habit-x',
      }),
    )

    await flushQueuedMutations()

    expect(mocks.clearOfflineEntity).toHaveBeenCalledWith('habit', 'offline-habit-x')
    expect(mocks.resolveOfflineEntity).not.toHaveBeenCalled()
  })

  it('clears the deleted entity when a delete flush succeeds', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockResolvedValue(null)

    mocks.queued.push(
      buildQueuedMutation({
        type: 'deleteHabit',
        scope: 'habits',
        endpoint: '/api/habits/habit-9',
        method: 'DELETE',
        payload: undefined,
        entityType: 'habit',
        targetEntityId: 'habit-9',
      }),
    )

    await flushQueuedMutations()

    expect(mocks.clearOfflineEntity).toHaveBeenCalledWith('habit', 'habit-9')
  })

  it('marks a temp entity failed on a retryable non-transient error without dropping it', async () => {
    mocks.setOnline(true)
    mocks.apiClient.mockRejectedValue(new Error('500 internal server error'))

    mocks.queued.push({
      ...buildQueuedMutation({
        type: 'createHabit',
        scope: 'habits',
        endpoint: '/api/habits',
        method: 'POST',
        payload: { title: 'Read' },
        entityType: 'habit',
        clientEntityId: 'offline-habit-y',
      }),
      id: 'create-retry',
    })

    const result = await flushQueuedMutations()

    expect(result.failed).toBe(1)
    expect(result.droppedMutations).toMatchObject([])
    expect(mocks.setOfflineEntityStatus).toHaveBeenCalledWith(
      'habit',
      'offline-habit-y',
      'failed',
      '500 internal server error',
    )
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('skips a mutation that vanished from the queue between snapshot and processing', async () => {
    mocks.setOnline(true)
    const phantom = { ...buildQueuedMutation({
      type: 'updateHabit',
      scope: 'habits',
      endpoint: '/api/habits/gone',
      method: 'PUT',
      payload: { title: 'Gone' },
    }), id: 'phantom-1' }
    mocks.getAll.mockReturnValueOnce([phantom])

    const result = await flushQueuedMutations()

    expect(result).toEqual({ succeeded: 0, failed: 0, remaining: 0, droppedMutations: [], replayState: 'idle' })
    expect(mocks.apiClient).not.toHaveBeenCalled()
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
      expect(firstRun).toEqual({ succeeded: 0, failed: 0, remaining: 1, droppedMutations: [], replayState: 'waiting-on-backoff' })
      expect(mocks.queued[0]?.retries).toBe(1)
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(2)
      expect(mocks.queued).toHaveLength(0)
    })

    it('keeps backoff after earlier rows succeed before a network failure', async () => {
      mocks.setOnline(true)
      mocks.apiClient
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Network request failed'))
        .mockResolvedValueOnce(null)
      for (const suffix of ['first', 'second']) {
        mocks.queued.push({
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint: `/api/habits/${suffix}`,
            method: 'PUT',
            payload: { title: suffix },
            entityType: 'habit',
            targetEntityId: suffix,
          }),
          id: `update-${suffix}`,
        })
      }

      await flushQueuedMutations()

      expect(mocks.apiClient).toHaveBeenCalledTimes(2)
      expect(canAutoFlush()).toBe(false)
      await vi.advanceTimersByTimeAsync(1_999)
      expect(mocks.apiClient).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.apiClient).toHaveBeenCalledTimes(3)
    })

    it('keeps timer ownership while fresh connectivity is pending', async () => {
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

      let resolveConnectivity: ((online: boolean) => void) | undefined
      mocks.getCurrentConnectivity.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => {
          resolveConnectivity = resolve
        }),
      )
      const hookFlushes: Promise<unknown>[] = []
      const unsubscribe = subscribeReplayState((state) => {
        if (state === 'idle' && mocks.count() > 0) {
          hookFlushes.push(flushQueuedMutations())
        }
      })

      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.getCurrentConnectivity).toHaveBeenCalledTimes(1)
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      expect(mocks.queued[0]?.retries).toBe(1)

      resolveConnectivity?.(false)
      await Promise.resolve()
      await Promise.all(hookFlushes)

      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      expect(mocks.queued[0]?.retries).toBe(1)
      unsubscribe()
    })

    it('schedules backoff when queue persistence rejects with pending work', async () => {
      mocks.setOnline(true)
      mocks.apiClient.mockRejectedValueOnce(new Error('Network request failed'))
      mocks.persistQueryCache.mockRejectedValueOnce(new Error('Queue persistence failed'))
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

      await expect(flushQueuedMutations()).rejects.toThrow('Queue persistence failed')
      expect(canAutoFlush()).toBe(false)
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1_999)
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.apiClient).toHaveBeenCalledTimes(2)
      expect(mocks.queued).toHaveLength(0)
    })

    it('settles and reports a second persistence rejection from a timer retry', async () => {
      mocks.setOnline(true)
      mocks.apiClient.mockRejectedValue(new Error('Network request failed'))
      mocks.persistQueryCache
        .mockRejectedValueOnce(new Error('Initial queue persistence failed'))
        .mockRejectedValueOnce(new Error('Timer queue persistence failed'))
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

      const unhandledRejections: unknown[] = []
      const recordUnhandledRejection = (reason: unknown) => {
        unhandledRejections.push(reason)
      }
      process.on('unhandledRejection', recordUnhandledRejection)

      try {
        await expect(flushQueuedMutations()).rejects.toThrow('Initial queue persistence failed')
        await vi.advanceTimersByTimeAsync(2_000)
        await waitForCapturedError()
        expect(mocks.captureError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Timer queue persistence failed' }),
        )

        expect(unhandledRejections).toEqual([])
        expect(canAutoFlush()).toBe(false)
      } finally {
        process.off('unhandledRejection', recordUnhandledRejection)
      }
    })

    it('bounds repeated request failures at the mutation retry limit', async () => {
      mocks.setOnline(true)
      mocks.apiClient.mockRejectedValue(new TypeError('Network request failed'))
      const dropped: { id: string; type: string }[] = []
      const unsubscribe = subscribeDroppedMutations((mutation) => {
        dropped.push({ id: mutation.id, type: mutation.type })
      })

      mocks.queued.push({
        ...buildQueuedMutation({
          type: 'updateHabit',
          scope: 'habits',
          endpoint: '/api/habits/habit-1',
          method: 'PUT',
          payload: { title: 'Walk' },
        }),
        id: 'bounded-retry',
      })

      await flushQueuedMutations()
      expect(mocks.queued[0]?.retries).toBe(1)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(mocks.queued[0]?.retries).toBe(2)
      await vi.advanceTimersByTimeAsync(4_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(3)
      expect(mocks.count()).toBe(0)
      expect(dropped).toEqual([{ id: 'bounded-retry', type: 'updateHabit' }])
      unsubscribe()
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

    it('resets backoff without re-flushing when the queue empties before the retry fires', async () => {
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

      await flushQueuedMutations()
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      expect(getReplayState()).toBe('waiting-on-backoff')

      mocks.queued.length = 0

      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      expect(getReplayState()).toBe('idle')
      expect(canAutoFlush()).toBe(true)
    })

    it('backs off a no-progress dependency pass instead of replaying immediately', async () => {
      mocks.setOnline(true)
      mocks.queued.push({
        ...buildQueuedMutation({
          type: 'updateHabit',
          scope: 'habits',
          endpoint: '/api/habits/offline-habit-stuck',
          method: 'PUT',
          payload: { title: 'Blocked' },
          entityType: 'habit',
          targetEntityId: 'offline-habit-stuck',
        }),
        id: 'dependency-blocked',
      })

      const firstRun = await flushQueuedMutations()

      expect(firstRun.remaining).toBe(1)
      expect(mocks.apiClient).not.toHaveBeenCalled()
      const callsBeforeTimer = mocks.getAll.mock.calls.length
      await vi.advanceTimersByTimeAsync(1_999)
      expect(mocks.getAll).toHaveBeenCalledTimes(callsBeforeTimer)
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.getAll.mock.calls.length).toBeGreaterThan(callsBeforeTimer)
    })

    it('drops an expired orphan dependency but preserves a live producer', async () => {
      mocks.setOnline(true)
      const oldTimestamp = Date.now() - 24 * 60 * 60 * 1000 - 1
      mocks.apiClient.mockRejectedValueOnce(new Error('500 internal server error'))
      mocks.queued.push(
        {
          ...buildQueuedMutation({
            type: 'createHabit',
            scope: 'habits',
            endpoint: '/api/habits',
            method: 'POST',
            payload: { title: 'Producer' },
            entityType: 'habit',
            clientEntityId: 'offline-habit-live',
          }),
          id: 'producer',
          timestamp: oldTimestamp,
        },
        {
          ...buildQueuedMutation({
            type: 'updateHabit',
            scope: 'habits',
            endpoint: '/api/habits/offline-habit-live',
            method: 'PUT',
            payload: { title: 'Dependent' },
            entityType: 'habit',
            targetEntityId: 'offline-habit-live',
          }),
          id: 'dependent',
          timestamp: oldTimestamp,
        },
      )

      const liveProducerRun = await flushQueuedMutations()
      expect(liveProducerRun.droppedMutations).toEqual([])
      expect(mocks.queued.map((mutation) => mutation.id)).toEqual(['producer', 'dependent'])
      cancelScheduledFlush()

      mocks.queued.splice(0, 1)
      const orphanRun = await flushQueuedMutations()
      expect(orphanRun.droppedMutations).toMatchObject([
        expect.objectContaining({ id: 'dependent', type: 'updateHabit' }),
      ])
    })

    it('does not treat user text beginning with offline as an entity reference', async () => {
      mocks.setOnline(true)
      mocks.queued.push({
        ...buildQueuedMutation({
          type: 'updateTag',
          scope: 'tags',
          endpoint: '/api/tags/tag-1',
          method: 'PUT',
          payload: { name: 'offline-work' },
          entityType: 'tag',
          targetEntityId: 'tag-1',
        }),
        id: 'tag-name',
      })

      const result = await flushQueuedMutations()

      expect(result.succeeded).toBe(1)
      expect(mocks.apiClient).toHaveBeenCalledWith(
        '/api/tags/tag-1',
        expect.anything(),
        undefined,
      )
    })
  })

  describe('stress replay, crash recovery, timeout, and dependency ordering', () => {
    it('replays 120 queued mutations in enqueue order, applying every one with none dropped', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      mocks.apiClient.mockImplementation((endpoint: string) => {
        flushOrder.push(endpoint)
        return Promise.resolve(null)
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

      expect(result).toEqual({ succeeded: total, failed: 0, remaining: 0, droppedMutations: [], replayState: 'idle' })
      expect(flushOrder).toEqual(expectedOrder)
      expect(mocks.queued).toHaveLength(0)
    })

    it('resumes a flush interrupted by a mid-batch network drop without re-applying already-synced mutations', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      let dropThirdOnce = true
      mocks.apiClient.mockImplementation((endpoint: string) => {
        flushOrder.push(endpoint)
        if (endpoint === '/api/habits/habit-c' && dropThirdOnce) {
          dropThirdOnce = false
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve(null)
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

      expect(interrupted).toEqual({ succeeded: 2, failed: 0, remaining: 2, droppedMutations: [], replayState: 'waiting-on-backoff' })
      expect(mocks.queued.map((mutation) => mutation.id)).toEqual(['update-c', 'update-d'])
      expect(mocks.queued.find((mutation) => mutation.id === 'update-c')?.status).toBe('failed')
      expect(mocks.queued.find((mutation) => mutation.id === 'update-d')?.status).toBe('pending')

      const resumed = await flushQueuedMutations()

      expect(resumed).toEqual({ succeeded: 2, failed: 0, remaining: 0, droppedMutations: [], replayState: 'idle' })
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
      mocks.apiClient.mockImplementation((endpoint: string) => {
        flushOrder.push(endpoint)
        if (endpoint === '/api/habits/habit-slow') {
          return Promise.reject(new Error('The request timed out'))
        }
        return Promise.resolve(null)
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

      expect(result).toEqual({ succeeded: 1, failed: 0, remaining: 2, droppedMutations: [], replayState: 'waiting-on-backoff' })
      expect(flushOrder).toEqual(['/api/habits/habit-fast', '/api/habits/habit-slow'])

      const timedOut = mocks.queued.find((mutation) => mutation.id === 'update-slow')
      expect(timedOut?.status).toBe('failed')
      expect(timedOut?.lastError).toContain('timed out')
      expect(timedOut?.retries).toBe(1)

      const untouched = mocks.queued.find((mutation) => mutation.id === 'update-tail')
      expect(untouched?.status).toBe('pending')

      cancelScheduledFlush()
    })

    it('defers a dependent mutation until its offline dependency resolves, even when queued ahead of the create', async () => {
      mocks.setOnline(true)
      const flushOrder: string[] = []
      mocks.apiClient.mockImplementation((endpoint: string) => {
        flushOrder.push(endpoint)
        if (endpoint === '/api/tags') return Promise.resolve({ id: 'tag-1' })
        return Promise.resolve(null)
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

      expect(firstPass).toEqual({ succeeded: 1, failed: 0, remaining: 1, droppedMutations: [], replayState: 'idle' })
      expect(flushOrder).toEqual(['/api/tags'])
      expect(mocks.apiClient).not.toHaveBeenCalledWith('/api/habits/habit-1/tags', expect.anything())

      const deferred = mocks.queued.find((mutation) => mutation.id === 'assign-1')
      expect(deferred?.status).toBe('pending')
      expect(deferred?.payload).toEqual({ tagIds: ['tag-1'] })

      const secondPass = await flushQueuedMutations()

      expect(secondPass).toEqual({ succeeded: 1, failed: 0, remaining: 0, droppedMutations: [], replayState: 'idle' })
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

describe('offline mutation helpers', () => {
  it('recognizes a queued marker and rejects other shapes', () => {
    expect(isQueuedResult(createQueuedAck('mutation-1'))).toBe(true)
    expect(isQueuedResult({ queued: false })).toBe(false)
    expect(isQueuedResult({ id: 'habit-1' })).toBe(false)
    expect(isQueuedResult(null)).toBe(false)
    expect(isQueuedResult('queued')).toBe(false)
  })

  it('creates a namespaced temp entity id for the entity type', () => {
    const first = createTempEntityId('habit')
    const second = createTempEntityId('habit')

    expect(first).toMatch(/^offline-habit-/)
    expect(first).not.toBe(second)
  })

  it('merges a queued marker into an existing object without losing its fields', () => {
    const marked = withQueuedMarker({ id: 'habit-1', title: 'Read' }, 'mutation-9')

    expect(marked).toMatchObject({
      id: 'habit-1',
      title: 'Read',
      queued: true,
      queuedMutationId: 'mutation-9',
    })
  })

  it('maps every mutation type group to its invalidation scope', () => {
    const cases: [MutationType, string][] = [
      ['createGoal', 'goals'],
      ['restoreGoal', 'goals'],
      ['restoreTag', 'tags'],
      ['setName', 'profile'],
      ['linkGoalHabits', 'goals'],
      ['assignTags', 'tags'],
      ['markNotificationRead', 'notifications'],
      ['createApiKey', 'apiKeys'],
      ['dismissCalendarPrompt', 'calendar'],
      ['setLanguage', 'profile'],
      ['resetProfile', 'profile'],
      ['createHabit', 'habits'],
    ]

    for (const [type, scope] of cases) {
      expect(getMutationScope(type)).toBe(scope)
    }
  })

  it.each(['offline-work', 'offline-habit-123-1'])('delivers tag text %s instead of waiting for a dependency', async (name) => {
    mocks.apiClient.mockClear()
    mocks.invalidateQueries.mockClear()
    mocks.queued.length = 0
    mocks.setOnline(true)
    const payload = { name, color: '#123456' }
    mocks.queued.push(buildQueuedMutation({
      type: 'updateTag', scope: 'tags', endpoint: '/api/tags/work', method: 'PUT', payload,
    }))
    expect(await flushQueuedMutations()).toMatchObject({ succeeded: 1, remaining: 0 })
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/tags/work', expect.objectContaining({ body: JSON.stringify(payload) }), undefined)
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tags'] })
  })
  describe('stuck queue recovery', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mocks.queued.length = 0
      mocks.resolvedIds.clear()
      mocks.apiClient.mockReset()
      mocks.apiClient.mockResolvedValue(null)
      cancelScheduledFlush()
      vi.useFakeTimers()
      mocks.setOnline(true)
      useOfflineSyncStore.setState({ drops: [] })
    })
    afterEach(() => { cancelScheduledFlush(); vi.useRealTimers(); vi.restoreAllMocks() })

    function blockedMutation() {
      return buildQueuedMutation({ type: 'logHabit', scope: 'habits', endpoint: '/api/habits/offline-habit-orphan/log', method: 'POST', payload: { date: '2026-09-05' }, entityType: 'habit', targetEntityId: 'offline-habit-orphan' })
    }

    it.each([401, 403])('cancels an existing retry on HTTP %s after partial progress without exhausting a row', async (status) => {
      const first = buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/first', method: 'PUT', payload: {} })
      const stopped = buildQueuedMutation({ type: 'createHabit', scope: 'habits', endpoint: '/api/habits', method: 'POST', payload: { title: 'Read' }, entityType: 'habit', clientEntityId: 'offline-habit-stopped' })
      stopped.retries = stopped.maxRetries - 1
      mocks.queued.push(first, stopped)
      mocks.apiClient.mockRejectedValueOnce(new Error('Network request failed'))
      await flushQueuedMutations()
      expect(getReplayState()).toBe('waiting-on-backoff')

      mocks.apiClient.mockResolvedValueOnce(null).mockRejectedValue(new ApiClientError(status, 'Access denied'))
      expect(await flushQueuedMutations()).toMatchObject({ succeeded: 1, failed: 1, remaining: 1, droppedMutations: [] })
      const queuedAfterStop = structuredClone(mocks.queued)
      await vi.advanceTimersByTimeAsync(120_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(3)
      expect(mocks.queued).toEqual(queuedAfterStop)
      expect(stopped.retries).toBe(stopped.maxRetries - 1)
      expect(mocks.setOfflineEntityStatus).toHaveBeenLastCalledWith('habit', 'offline-habit-stopped', 'failed', 'Access denied')
      expect(useOfflineSyncStore.getState().drops).toEqual([])
      expect(getReplayState()).toBe('stopped-for-auth')
      expect(vi.getTimerCount()).toBe(0)
      expect(canAutoFlush()).toBe(false)

      cancelScheduledFlush()
      expect(canAutoFlush()).toBe(true)
      mocks.apiClient.mockResolvedValue(null)
      expect(await flushQueuedMutations()).toMatchObject({ succeeded: 1, remaining: 0 })
    })

    it('preserves an expired dependent while its producer retries and later resolves the reference', async () => {
      const producer = buildQueuedMutation({
        type: 'createHabit', scope: 'habits', endpoint: '/api/habits', method: 'POST',
        payload: { title: 'Read' }, entityType: 'habit', clientEntityId: 'offline-habit-orphan',
      })
      const dependent = blockedMutation()
      producer.timestamp = Date.now() - 26 * 60 * 60 * 1000
      dependent.timestamp = Date.now() - 25 * 60 * 60 * 1000
      mocks.queued.push(producer, dependent)
      mocks.apiClient.mockRejectedValueOnce(new Error('500 server error'))

      expect(await flushQueuedMutations()).toMatchObject({ failed: 1, remaining: 2, droppedMutations: [] })
      expect(producer).toMatchObject({ retries: 1, status: 'failed' })
      expect(dependent).toMatchObject({ retries: 0, status: 'pending' })
      expect(useOfflineSyncStore.getState().drops).toEqual([])

      mocks.apiClient.mockImplementation((endpoint: string) =>
        Promise.resolve(endpoint === '/api/habits' ? { id: 'habit-1' } : null),
      )
      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.apiClient).toHaveBeenCalledTimes(3)
      expect(mocks.apiClient).toHaveBeenLastCalledWith('/api/habits/habit-1/log', expect.objectContaining({
        body: JSON.stringify(dependent.payload), idempotencyKey: dependent.id,
      }), logHabitResponseSchema)
      expect(mocks.queued).toEqual([])
      expect(useOfflineSyncStore.getState().drops).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    })

    it('backs off a dependency wait beyond six timers and drops exactly once at 24 hours', async () => {
      const mutation = blockedMutation()
      mocks.queued.push(mutation)
      const listener = vi.fn()
      const unsubscribe = subscribeDroppedMutations(listener)
      await flushQueuedMutations()
      expect(canAutoFlush()).toBe(false)
      expect(mocks.apiClient).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(182_000)
      expect(mocks.persistQueryCache).toHaveBeenCalledTimes(8)
      expect(mocks.queued).toHaveLength(1)
      vi.setSystemTime(mutation.timestamp + 24 * 60 * 60 * 1000 - 1)
      await flushQueuedMutations()
      expect(listener).not.toHaveBeenCalled()
      vi.setSystemTime(mutation.timestamp + 24 * 60 * 60 * 1000)
      await flushQueuedMutations()
      await flushQueuedMutations()
      expect(mocks.queued).toHaveLength(0)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ lastError: 'Unresolved dependency after 24 hours', mutation }))
      expect(useOfflineSyncStore.getState().drops).toHaveLength(1)
      expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('logHabit: Unresolved dependency') }))
      unsubscribe()
    })

    it('cancels the pending timer after progress and preserves a younger blocked change', async () => {
      mocks.queued.push(blockedMutation())
      await flushQueuedMutations()
      expect(canAutoFlush()).toBe(false)
      mocks.queued.push(buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/real', method: 'PUT', payload: {} }))
      const result = await flushQueuedMutations()
      expect(result).toMatchObject({ succeeded: 1, remaining: 1 })
      expect(canAutoFlush()).toBe(true)
      const calls = mocks.persistQueryCache.mock.calls.length
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.persistQueryCache).toHaveBeenCalledTimes(calls)
    })


    it('counts a terminal removal as progress when another dependency is still blocked', async () => {
      mocks.queued.push(blockedMutation())
      await flushQueuedMutations()
      expect(canAutoFlush()).toBe(false)
      mocks.apiClient.mockRejectedValue(new Error('400 validation failed'))
      mocks.queued.push(buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/real', method: 'PUT', payload: {} }))
      const result = await flushQueuedMutations()
      expect(result).toMatchObject({ succeeded: 0, failed: 1, remaining: 1 })
      expect(result.droppedMutations).toHaveLength(1)
      expect(canAutoFlush()).toBe(true)
    })

    it('bounds repeated server failures by the schedule and keeps the existing three-failure ceiling', async () => {
      mocks.apiClient.mockRejectedValue(new Error('500 server error'))
      mocks.queued.push(buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/real', method: 'PUT', payload: {} }))
      await flushQueuedMutations()
      expect(mocks.queued[0]).toMatchObject({ retries: 1, status: 'failed' })
      await vi.advanceTimersByTimeAsync(1_999)
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.queued[0]).toMatchObject({ retries: 2 })
      await vi.advanceTimersByTimeAsync(4_000)
      expect(mocks.apiClient).toHaveBeenCalledTimes(3)
      expect(mocks.queued).toEqual([])
      expect(useOfflineSyncStore.getState().drops).toHaveLength(1)
    })

    it('reports an in-flight no-op truthfully', async () => {
      let finish: (() => void) | undefined
      mocks.apiClient.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(null) }))
      mocks.queued.push(buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/real', method: 'PUT', payload: {} }))
      const first = flushQueuedMutations()
      await vi.waitFor(() => expect(finish).toBeDefined())
      expect(await flushQueuedMutations()).toMatchObject({ replayState: 'flushing', remaining: 1 })
      finish?.()
      await first
    })

    it.each(['getItem', 'setItem'] as const)('delivers installed rows despite persistent recovery marker %s failures', async (operation) => {
      vi.resetModules()
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage')
      const replay = await import('@/lib/offline-mutations')
      const recoveryKey = '@orbit/offline-queue-recovery-310'
      const markerError = new Error('Recovery marker unavailable')
      vi.spyOn(AsyncStorage, 'getItem').mockImplementation((key) => {
        if (key === recoveryKey && operation === 'getItem') return Promise.reject(markerError)
        return Promise.resolve(null)
      })
      vi.spyOn(AsyncStorage, 'setItem').mockImplementation((key) => {
        if (key === recoveryKey && operation === 'setItem') return Promise.reject(markerError)
        return Promise.resolve()
      })
      const mutation = buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: '/api/habits/real', method: 'PUT', payload: {} })
      mocks.queued.push({ ...mutation, status: 'syncing' })
      try {
        await expect(replay.flushQueuedMutations()).resolves.toMatchObject({ succeeded: 1, remaining: 0 })
        expect(mocks.update).toHaveBeenCalledWith(mutation.id, { status: 'pending' })
        expect(mocks.apiClient).toHaveBeenCalledTimes(1)
        expect(captureError).toHaveBeenCalledTimes(1)
        expect(replay.canAutoFlush()).toBe(true)
        mocks.queued.push(buildQueuedMutation({ ...mutation, scope: 'habits', type: 'updateHabit' }))
        await replay.flushQueuedMutations()
        await vi.advanceTimersByTimeAsync(120_000)
        expect(mocks.apiClient).toHaveBeenCalledTimes(2)
        expect(captureError).toHaveBeenCalledTimes(1)
        expect(mocks.queued).toEqual([])
      } finally {
        replay.cancelScheduledFlush()
      }
    })

    it('recovers installed syncing rows once and applies the age limit on the first pass', async () => {
      vi.resetModules()
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage')
      const { flushQueuedMutations } = await import('@/lib/offline-mutations')
      const recoveryKey = '@orbit/offline-queue-recovery-310'
      let marker: string | null = null
      vi.spyOn(AsyncStorage, 'getItem').mockImplementation((key) => Promise.resolve(key === recoveryKey ? marker : null))
      const write = vi.spyOn(AsyncStorage, 'setItem').mockImplementation((key, value) => { if (key === recoveryKey) marker = value; return Promise.resolve() })
      const mutation = { ...blockedMutation(), timestamp: Date.now() - 24 * 60 * 60 * 1000, status: 'syncing' as const }
      mocks.queued.push(mutation)
      await flushQueuedMutations()
      await flushQueuedMutations()
      expect(mocks.update).toHaveBeenCalledWith(mutation.id, { status: 'pending' })
      expect(mocks.queued).toEqual([])
      expect(write.mock.calls.filter(([key]) => key === recoveryKey)).toHaveLength(1)
    })
  })

})

import { describe, expect, it, vi } from 'vitest'

type AsyncStorageMock = {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
}

async function loadOfflineStateModule(overrides?: Partial<AsyncStorageMock>) {
  vi.resetModules()

  const asyncStorage: AsyncStorageMock = {
    getItem: overrides?.getItem ?? vi.fn(async () => null),
    setItem: overrides?.setItem ?? vi.fn(async () => {}),
  }

  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: asyncStorage,
  }))

  const offlineState = await import('@/lib/offline-state')
  return {
    asyncStorage,
    ...offlineState,
  }
}

function getStoredEntities(asyncStorage: AsyncStorageMock): Record<string, unknown> {
  const lastCall = asyncStorage.setItem.mock.calls.at(-1)
  const rawState = lastCall?.[1]

  if (typeof rawState !== 'string') {
    return {}
  }

  return (JSON.parse(rawState) as { entities: Record<string, unknown> }).entities
}

describe('offline-state', () => {
  it('persists offline entities and resolves ids when a server id is available', async () => {
    const {
      asyncStorage,
      getResolvedEntityId,
      resolveOfflineEntity,
      upsertOfflineEntity,
    } = await loadOfflineStateModule()

    await upsertOfflineEntity({
      entityType: 'habit',
      tempId: 'offline-habit-1',
      serverId: null,
      status: 'pending',
      tombstone: false,
      updatedAt: 1,
      lastError: null,
    })

    expect(await getResolvedEntityId('habit', 'offline-habit-1')).toBe('offline-habit-1')

    await resolveOfflineEntity('habit', 'offline-habit-1', 'habit-1')

    expect(await getResolvedEntityId('habit', 'offline-habit-1')).toBe('habit-1')
    expect(getStoredEntities(asyncStorage)).toMatchObject({
      'habit:offline-habit-1': {
        entityType: 'habit',
        tempId: 'offline-habit-1',
        serverId: 'habit-1',
        status: 'synced',
        tombstone: false,
        lastError: null,
      },
    })
  })

  it('updates existing entity status and last error', async () => {
    const {
      asyncStorage,
      setOfflineEntityStatus,
      upsertOfflineEntity,
    } = await loadOfflineStateModule()

    await upsertOfflineEntity({
      entityType: 'tag',
      tempId: 'offline-tag-1',
      serverId: null,
      status: 'pending',
      tombstone: false,
      updatedAt: 1,
      lastError: null,
    })

    await setOfflineEntityStatus('tag', 'offline-tag-1', 'failed', 'Request timed out')

    expect(getStoredEntities(asyncStorage)).toMatchObject({
      'tag:offline-tag-1': {
        entityType: 'tag',
        tempId: 'offline-tag-1',
        serverId: null,
        status: 'failed',
        lastError: 'Request timed out',
      },
    })
  })

  it('marks tombstones for both offline and server-backed ids', async () => {
    const {
      asyncStorage,
      markOfflineTombstone,
      upsertOfflineEntity,
    } = await loadOfflineStateModule()

    await markOfflineTombstone('habit', 'offline-habit-2')
    expect(getStoredEntities(asyncStorage)).toMatchObject({
      'habit:offline-habit-2': {
        entityType: 'habit',
        tempId: 'offline-habit-2',
        serverId: null,
        status: 'pending',
        tombstone: true,
        lastError: null,
      },
    })

    await upsertOfflineEntity({
      entityType: 'goal',
      tempId: 'goal-1',
      serverId: 'goal-1',
      status: 'syncing',
      tombstone: false,
      updatedAt: 1,
      lastError: 'Old error',
    })
    await markOfflineTombstone('goal', 'goal-1', false)

    expect(getStoredEntities(asyncStorage)).toMatchObject({
      'goal:goal-1': {
        entityType: 'goal',
        tempId: 'goal-1',
        serverId: 'goal-1',
        status: 'syncing',
        tombstone: false,
        lastError: 'Old error',
      },
    })
  })

  it('clears stored entities after they are no longer needed', async () => {
    const {
      asyncStorage,
      clearOfflineEntity,
      getResolvedEntityId,
      resolveOfflineEntity,
    } = await loadOfflineStateModule()

    await resolveOfflineEntity('habit', 'offline-habit-3', 'habit-3')
    expect(await getResolvedEntityId('habit', 'offline-habit-3')).toBe('habit-3')

    await clearOfflineEntity('habit', 'offline-habit-3')

    expect(await getResolvedEntityId('habit', 'offline-habit-3')).toBe('offline-habit-3')
    expect(getStoredEntities(asyncStorage)).not.toHaveProperty('habit:offline-habit-3')
  })

  it('falls back to in-memory state when storage reads or writes fail', async () => {
    const {
      getResolvedEntityId,
      markOfflineTombstone,
      upsertOfflineEntity,
    } = await loadOfflineStateModule({
      getItem: vi.fn(async () => {
        throw new Error('read failed')
      }),
      setItem: vi.fn(async () => {
        throw new Error('write failed')
      }),
    })

    await expect(
      upsertOfflineEntity({
        entityType: 'tag',
        tempId: 'offline-tag-2',
        serverId: null,
        status: 'pending',
        tombstone: false,
        updatedAt: 1,
        lastError: null,
      }),
    ).resolves.toBeUndefined()

    await expect(markOfflineTombstone('tag', 'offline-tag-2')).resolves.toBeUndefined()
    await expect(getResolvedEntityId('tag', 'offline-tag-2')).resolves.toBe('offline-tag-2')
  })
})

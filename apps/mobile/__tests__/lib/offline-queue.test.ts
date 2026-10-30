import reminderWire from '@orbit/shared/test-support/fixtures/habit-reminder-wire.json'
import { habitDetailSchema } from '@orbit/shared/types/habit'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import type { SQLInputValue } from 'node:sqlite'
import type { QueuedMutation } from '@orbit/shared/types/sync'
import { habitKeys } from '@orbit/shared/query'
import { buildQueuedMutation, cancelScheduledFlush, flushQueuedMutations, queueOrExecute } from '@/lib/offline-mutations'

import {
  claimLegacyAccount,
  clear,
  discardLegacy,
  count,
  dequeue,
  enqueue,
  enqueueWithCompaction,
  findUnfinalizedFirstWrite,
  getAll,
  incrementRetries,
  replaceEntityReferences,
  remove,
  retainAccount,
  subscribeQueueCount,
  update,
} from '@/lib/offline-queue'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const replayMocks = vi.hoisted(() => ({
  apiClient: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getCurrentConnectivity: vi.fn(() => Promise.resolve(true)),
  persistRecovery: vi.fn(() => Promise.resolve()),
  invalidateQueries: vi.fn(() => Promise.resolve()),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: () => Promise.resolve(null), setItem: replayMocks.persistRecovery },
}))
vi.mock('@/lib/api-client', () => ({ apiClient: replayMocks.apiClient }))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'test-account' }))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: replayMocks.getCurrentConnectivity }))
vi.mock('@/lib/offline-state', () => ({
  getResolvedEntityId: (_entityType: string, id: string) => Promise.resolve(id),
  upsertOfflineEntity: vi.fn(),
  setOfflineEntityStatus: vi.fn(),
  resolveOfflineEntity: vi.fn(),
  clearOfflineEntity: vi.fn(),
  markOfflineTombstone: vi.fn(),
}))
vi.mock('@/lib/query-client', () => ({
  persistQueryCache: vi.fn(),
  queryClient: { invalidateQueries: replayMocks.invalidateQueries, getQueriesData: () => [] },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/stores/offline-sync-store', () => ({
  useOfflineSyncStore: { getState: () => ({ addDrop: vi.fn() }) },
}))

const { database, withTransactionSyncMock } = await vi.hoisted(async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(':memory:')
  database.exec(`CREATE TABLE mutation_queue (
    id TEXT PRIMARY KEY NOT NULL, timestamp INTEGER NOT NULL, type TEXT NOT NULL,
    endpoint TEXT NOT NULL, method TEXT NOT NULL, payload TEXT,
    retries INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 3
  ); INSERT INTO mutation_queue VALUES
    ('legacy-first', 1, 'setName', '/api/profile/name', 'PUT', '{"name":"First"}', 0, 3),
    ('legacy-later', 2, 'setName', '/api/profile/name', 'PUT', '{"name":"Later"}', 1, 3);`)
  return {
    database,
    withTransactionSyncMock: vi.fn((task: () => void) => {
      database.exec('BEGIN')
      try { task(); database.exec('COMMIT') }
      catch (error) { database.exec('ROLLBACK'); throw error }
    }),
  }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }), subscribe: () => () => {} },
}))

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => database.exec(sql),
    runSync: (sql: string, params: SQLInputValue[] = []) => { database.prepare(sql).run(...params) },
    getAllSync: (sql: string, params: SQLInputValue[] = []) => database.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: SQLInputValue[] = []) => database.prepare(sql).get(...params) ?? null,
    withTransactionSync: withTransactionSyncMock,
  }),
}))

it('marks every shipped-schema row as legacy and hides it until the persisted account claims it', () => {
  expect(getAll()).toEqual([])
  expect(count()).toBe(0)
  expect(database.prepare('SELECT id, owner_state, account_id FROM mutation_queue ORDER BY timestamp').all()).toEqual([
    { id: 'legacy-first', owner_state: 'legacy', account_id: null },
    { id: 'legacy-later', owner_state: 'legacy', account_id: null },
  ])
  claimLegacyAccount('account-a')
  expect(getAll()).toMatchObject([{ id: 'legacy-first', retries: 0 }, { id: 'legacy-later', retries: 1 }])
  claimLegacyAccount('account-b')
  expect(count()).toBe(2)
})

let mutationSequence = 0

function makeMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: overrides.id ?? `mutation-${mutationSequence++}`,
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
    withTransactionSyncMock.mockClear()
    cancelScheduledFlush()
    replayMocks.apiClient.mockReset()
    replayMocks.getCurrentConnectivity.mockResolvedValue(true)
    replayMocks.persistRecovery.mockReset()
    replayMocks.persistRecovery.mockResolvedValue(undefined)
    replayMocks.invalidateQueries.mockClear()
  })

  it('retains the parent confirmation boundary in stored queue metadata', () => {
    const mutation = { ...buildQueuedMutation({ type: 'bulkLogHabits', scope: 'habits', endpoint: '/api/habits/bulk/log', method: 'POST', payload: { items: [{ habitId: 'parent' }] } }), suppressParentSettlement: true }
    enqueue(mutation)
    expect(getAll()).toEqual([expect.objectContaining({ id: mutation.id, suppressParentSettlement: true })])
  })

  it.each([{ parentId: '22222222-2222-4222-8222-222222222222' }, { clearParent: true }])('keeps parent changes after pending Create instead of merging incompatible fields: %s', (parentChange) => {
    const source = 'offline-habit-source'
    enqueueWithCompaction(makeMutation({ id: 'create-source', clientEntityId: source, payload: { title: 'Before' } }))
    enqueueWithCompaction(makeMutation({ id: 'edit-source', type: 'updateHabit', method: 'PUT', endpoint: `/api/habits/${source}`, targetEntityId: source, dependsOn: [source], payload: { title: 'After', isBadHabit: false, ...parentChange } }))
    expect(getAll().map((entry) => [entry.type, entry.payload])).toEqual([
      ['createHabit', { title: 'Before' }], ['updateHabit', { title: 'After', isBadHabit: false, ...parentChange }],
    ])
    expect(getAll()[1]!.dependsOn).toEqual([source])
  })

  it('preserves a retired persisted operation without assigning current metadata', () => {
    const retiredType = ['delete', 'User', 'Fact'].join('')
    database.prepare(`INSERT INTO mutation_queue
      (id, timestamp, type, endpoint, method, payload, retries, max_retries, meta, account_id, owner_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'retired-scope-row', Date.now(), retiredType, ['/api/user', '-facts/retired'].join(''),
      'DELETE', 'null', 0, 3, JSON.stringify({
        scope: ['user', 'Facts'].join(''), entityType: ['user', 'Fact'].join(''),
      }), 'account-a', 'account',
    )

    expect(getAll()[0]).toEqual(expect.objectContaining({
      type: retiredType,
      scope: undefined,
      entityType: undefined,
    }))
  })

  it('keeps legacy rows quarantined across compaction and prunes them instead of adopting them', () => {
    database.prepare(`INSERT INTO mutation_queue
      (id, timestamp, type, endpoint, method, payload)
      VALUES (?, ?, ?, ?, ?, ?)`).run('legacy-name', 1, 'setName', '/api/profile/name', 'PUT', '{"name":"Private"}')
    enqueue(makeMutation({ id: 'owned-create' }))
    update('legacy-name', { payload: { name: 'Changed' } })
    remove('legacy-name')
    expect(getAll().map((mutation) => mutation.id)).toEqual(['owned-create'])
    expect(count()).toBe(1)
    expect(database.prepare("SELECT owner_state FROM mutation_queue WHERE id = 'legacy-name'").get())
      .toEqual({ owner_state: 'legacy' })
    retainAccount('account-a')
    expect(database.prepare("SELECT id FROM mutation_queue WHERE id = 'legacy-name'").get()).toBeUndefined()
    expect(getAll().map((mutation) => mutation.id)).toEqual(['owned-create'])
  })

  it('discards only legacy rows when an unclaimed session ends', () => {
    database.prepare(`INSERT INTO mutation_queue
      (id, timestamp, type, endpoint, method, payload)
      VALUES (?, ?, ?, ?, ?, ?)`).run('legacy-name', 1, 'setName', '/api/profile/name', 'PUT', '{"name":"Private"}')
    enqueue(makeMutation({ id: 'owned-create' }))
    discardLegacy()
    expect(database.prepare('SELECT id FROM mutation_queue').all()).toEqual([{ id: 'owned-create' }])
  })

  it('rewrites the queue inside a single transaction so a crash cannot drop it', () => {
    enqueue(makeMutation({ id: 'create-1' }))

    expect(withTransactionSyncMock).toHaveBeenCalled()
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

  it.each([
    { status: 'syncing', retries: 0 },
    { status: 'failed', retries: 0 },
    { status: 'failed', retries: 1 },
    { status: 'pending', retries: 1 },
  ] as const)('keeps an edit separate from a $status create with $retries retries', ({ status, retries }) => {
    const create = makeMutation({
      id: 'create-1', clientEntityId: 'offline-habit-1', status, retries,
      payload: { title: 'Read' },
    })
    const edit = makeMutation({
      id: 'update-1', type: 'updateHabit', method: 'PUT',
      endpoint: '/api/habits/offline-habit-1', targetEntityId: 'offline-habit-1',
      payload: { title: 'Read before bed' },
    })
    enqueue(create)
    enqueue(edit)

    expect(getAll()).toEqual([create, edit])
  })

  it('keeps a recovered create payload unchanged when an edit arrives during recovery', async () => {
    enqueue(makeMutation({
      id: 'create-1', status: 'syncing', clientEntityId: 'offline-habit-1',
      payload: { title: 'Read' },
    }))
    const edit = makeMutation({
      id: 'update-1', type: 'updateHabit', method: 'PUT',
      endpoint: '/api/habits/offline-habit-1', targetEntityId: 'offline-habit-1',
      payload: { title: 'Read before bed' },
    })
    replayMocks.persistRecovery.mockImplementationOnce(() => {
      enqueue(edit)
      return Promise.resolve()
    })
    replayMocks.apiClient.mockResolvedValueOnce({ id: 'habit-1' }).mockResolvedValueOnce(null)

    const result = await flushQueuedMutations()

    expect(replayMocks.persistRecovery).toHaveBeenCalled()
    expect(result).toMatchObject({ succeeded: 2, remaining: 0 })
    expect(replayMocks.apiClient).toHaveBeenNthCalledWith(1, '/api/habits', {
      method: 'POST', body: JSON.stringify({ title: 'Read' }), idempotencyKey: 'create-1',
    }, undefined)
    expect(replayMocks.apiClient).toHaveBeenNthCalledWith(2, '/api/habits/habit-1', {
      method: 'PUT', body: JSON.stringify(edit.payload), idempotencyKey: edit.id,
    }, undefined)
  })

  it('keeps an edit separate after an online create loses its response', async () => {
    const create = makeMutation({ id: 'create-1', clientEntityId: 'offline-habit-1' })
    await queueOrExecute({
      mutation: create,
      execute: () => Promise.reject(new Error('Network request failed')),
      queuedResult: null,
    })
    const edit = makeMutation({
      id: 'update-1', type: 'updateHabit', method: 'PUT',
      endpoint: '/api/habits/offline-habit-1', targetEntityId: 'offline-habit-1',
      payload: { title: 'Read before bed' },
    })
    enqueue(edit)

    expect(getAll().map((mutation) => mutation.id)).toEqual(['create-1', 'update-1'])
    expect(getAll()[0]?.payload).toEqual(create.payload)
  })

  it('replays an edit queued while its create request is in flight against the resolved entity', async () => {
    const create = buildQueuedMutation({
      type: 'createHabit', scope: 'habits', entityType: 'habit',
      endpoint: '/api/habits', method: 'POST', payload: { title: 'Read' },
      clientEntityId: 'offline-habit-1',
    })
    enqueue(create)
    let finishCreate!: (response: { id: string }) => void
    const requestStarted = new Promise<void>((resolveStarted) => {
      replayMocks.apiClient.mockImplementationOnce(() => {
        resolveStarted()
        return new Promise((resolve) => { finishCreate = resolve })
      })
    })
    replayMocks.apiClient.mockResolvedValueOnce(null)
    const flushing = flushQueuedMutations()
    await requestStarted

    const edit = buildQueuedMutation({
      type: 'updateHabit', scope: 'habits', entityType: 'habit',
      endpoint: '/api/habits/offline-habit-1', method: 'PUT',
      targetEntityId: 'offline-habit-1', payload: { title: 'Read before bed' },
    })
    await queueOrExecute({ mutation: edit, execute: replayMocks.apiClient, queuedResult: null })
    finishCreate({ id: 'habit-1' })
    const firstPass = await flushing
    const secondPass = await flushQueuedMutations()

    expect(firstPass).toMatchObject({ succeeded: 1, remaining: 1 })
    expect(secondPass).toMatchObject({ succeeded: 1, remaining: 0 })
    expect(replayMocks.apiClient).toHaveBeenNthCalledWith(1, '/api/habits', {
      method: 'POST', body: JSON.stringify({ title: 'Read' }), idempotencyKey: create.id,
    }, undefined)
    expect(replayMocks.apiClient).toHaveBeenNthCalledWith(2, '/api/habits/habit-1', {
      method: 'PUT', body: JSON.stringify({ title: 'Read before bed' }), idempotencyKey: edit.id,
    }, undefined)
    expect(getAll()).toEqual([])
  })

  it('drops a pending create when the same temp entity is deleted before sync', () => {
    enqueue(makeMutation({
      id: 'create-1',
      type: 'createHabit',
      clientEntityId: 'offline-habit-2',
      targetEntityId: 'offline-habit-2',
    }))

    const { compactedCreate } = enqueueWithCompaction(makeMutation({
      id: 'delete-1',
      type: 'deleteHabit',
      method: 'DELETE',
      endpoint: '/api/habits/offline-habit-2',
      targetEntityId: 'offline-habit-2',
      payload: null,
    }))

    expect(getAll()).toHaveLength(0)
    expect(compactedCreate).toMatchObject({
      id: 'create-1',
      payload: { title: 'Drink Water' },
    })
  })

  it('drops a pending create when a cascading selection delete targets it', () => {
    enqueue(makeMutation({
      id: 'create-1',
      type: 'createHabit',
      clientEntityId: 'offline-habit-3',
      targetEntityId: 'offline-habit-3',
    }))

    enqueue(makeMutation({
      id: 'delete-1',
      type: 'bulkCascadeDeleteHabits',
      method: 'DELETE',
      endpoint: '/api/habits/offline-habit-3',
      targetEntityId: 'offline-habit-3',
      payload: null,
    }))

    expect(getAll()).toHaveLength(0)
  })

  it.each(['syncing', 'failed'] as const)(
    'keeps a %s create and its delete when the create may have reached the server',
    (status) => {
      enqueue(makeMutation({
        id: 'create-1', type: 'createGoal', scope: 'goals', entityType: 'goal',
        clientEntityId: 'offline-goal-1', status, retries: status === 'failed' ? 1 : 0,
      }))

      const result = enqueueWithCompaction(makeMutation({
        id: 'delete-1', type: 'deleteGoal', scope: 'goals', entityType: 'goal',
        method: 'DELETE', endpoint: '/api/goals/offline-goal-1',
        targetEntityId: 'offline-goal-1', payload: null,
      }))

      expect(result.compactedCreate).toBeNull()
      expect(getAll().map((mutation) => mutation.id)).toEqual(['create-1', 'delete-1'])
    },
  )

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

  it('keeps only the latest offline clock choice for replay', () => {
    enqueue(makeMutation({
      id: 'clock-1', type: 'setClockFormat', scope: 'profile', method: 'PUT',
      endpoint: '/api/profile/clock-format', dedupeKey: 'profile-clock-format',
      payload: { uses24HourClock: true },
    }))
    enqueue(makeMutation({
      id: 'clock-2', type: 'setClockFormat', scope: 'profile', method: 'PUT',
      endpoint: '/api/profile/clock-format', dedupeKey: 'profile-clock-format',
      payload: { uses24HourClock: false },
    }))
    expect(getAll()).toEqual([expect.objectContaining({
      id: 'clock-2', type: 'setClockFormat', payload: { uses24HourClock: false },
    })])
  })

  it('keeps a dependent onboarding habit attached when auto-sync replaces its timezone write', () => {
    enqueue(makeMutation({
      id: 'timezone-1', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/Sao_Paulo' },
    }))
    enqueue(makeMutation({
      id: 'habit-1', type: 'createHabit',
      dependsOn: ['offline-account-timezone:timezone-1'],
    }))

    const timezoneId = enqueue(makeMutation({
      id: 'timezone-2', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/New_York' },
    }))

    expect(timezoneId).toBe('timezone-1')
    expect(getAll()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'timezone-1', payload: { timeZone: 'America/Sao_Paulo' } }),
      expect.objectContaining({ id: 'habit-1', dependsOn: ['offline-account-timezone:timezone-1'] }),
    ]))
    expect(getAll()).toHaveLength(2)
  })

  it('moves a dropped timezone dependency to the retained auto-sync write on retry', () => {
    enqueue(makeMutation({
      id: 'timezone-1', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/Sao_Paulo' },
    }))
    enqueue(makeMutation({
      id: 'habit-1', type: 'createHabit',
      dependsOn: ['offline-account-timezone:timezone-1'],
    }))
    remove('timezone-1')
    enqueue(makeMutation({
      id: 'timezone-2', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/Sao_Paulo' },
    }))

    const retainedId = enqueue(makeMutation({
      id: 'timezone-1', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/Sao_Paulo' },
    }))

    expect(retainedId).toBe('timezone-2')
    expect(getAll()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'timezone-2' }),
      expect.objectContaining({ id: 'habit-1', dependsOn: ['offline-account-timezone:timezone-2'] }),
    ]))
    expect(getAll()).toHaveLength(2)
  })

  it('replaces an unreferenced auto-timezone write when the detected zone changes', () => {
    enqueue(makeMutation({
      id: 'timezone-1', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/Sao_Paulo' },
    }))

    const timezoneId = enqueue(makeMutation({
      id: 'timezone-2', type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone', method: 'PUT',
      dedupeKey: 'profile-timezone-auto', payload: { timeZone: 'America/New_York' },
    }))

    expect(timezoneId).toBe('timezone-2')
    expect(getAll()).toEqual([expect.objectContaining({
      id: 'timezone-2', payload: { timeZone: 'America/New_York' },
    })])
  })

  it('keeps a restored habit toggle as the first write for its habit and date', () => {
    const persistedMutation = makeMutation({
      id: 'persisted-log',
      type: 'logHabit',
      endpoint: '/api/habits/habit-1/log',
      payload: { date: '2026-08-29' },
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    })
    enqueue(persistedMutation)

    const retainedMutationId = enqueue(makeMutation({
      id: 'duplicate-log',
      type: 'logHabit',
      endpoint: '/api/habits/habit-1/log',
      payload: { date: '2026-08-29' },
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    }))

    expect(retainedMutationId).toBe(persistedMutation.id)
    expect(getAll()).toEqual([persistedMutation])
  })

  it('finds the retained habit toggle until its syncing row is finalized', () => {
    const persistedMutation = makeMutation({
      id: 'syncing-log',
      type: 'logHabit',
      status: 'syncing',
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    })
    enqueue(persistedMutation)

    expect(findUnfinalizedFirstWrite(makeMutation({
      id: 'direct-log',
      type: 'logHabit',
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    }))).toEqual(persistedMutation)

    remove(persistedMutation.id)

    expect(findUnfinalizedFirstWrite(makeMutation({
      id: 'second-direct-log',
      type: 'logHabit',
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    }))).toBeNull()
  })

  it('queues toggles independently for a different habit or date', () => {
    enqueue(makeMutation({
      id: 'habit-1-today',
      type: 'logHabit',
      dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      targetEntityId: 'habit-1',
    }))
    enqueue(makeMutation({
      id: 'habit-2-today',
      type: 'logHabit',
      dedupeKey: 'habit-toggle:habit-2:2026-08-29',
      targetEntityId: 'habit-2',
    }))
    enqueue(makeMutation({
      id: 'habit-1-tomorrow',
      type: 'logHabit',
      dedupeKey: 'habit-toggle:habit-1:2026-08-30',
      targetEntityId: 'habit-1',
    }))

    expect(getAll().map((mutation) => mutation.id)).toEqual([
      'habit-1-today',
      'habit-2-today',
      'habit-1-tomorrow',
    ])
  })

  it('keeps the create while compacting reorders and persists the resolved latest order', () => {
    enqueue(makeMutation({
      id: 'create-1',
      timestamp: 1,
      type: 'createHabit',
      clientEntityId: 'offline-habit-1',
    }))
    enqueue(makeMutation({
      id: 'reorder-1',
      timestamp: 2,
      type: 'reorderHabits',
      method: 'PUT',
      dedupeKey: 'habits:reorder',
      payload: { positions: [{ habitId: 'offline-habit-1', position: 2 }] },
    }))
    enqueue(makeMutation({
      id: 'reorder-2',
      timestamp: 3,
      type: 'reorderHabits',
      method: 'PUT',
      dedupeKey: 'habits:reorder',
      payload: { positions: [{ habitId: 'offline-habit-1', position: 0 }] },
    }))

    expect(getAll().map((mutation) => mutation.id)).toEqual(['create-1', 'reorder-2'])
    replaceEntityReferences('offline-habit-1', 'habit-1')
    remove('create-1')

    expect(getAll()).toMatchObject([{
      id: 'reorder-2',
      payload: { positions: [{ habitId: 'habit-1', position: 0 }] },
    }])
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

  it('collapses a last-write-wins key to the most recently enqueued write even when it carries an older timestamp', () => {
    enqueue(makeMutation({
      id: 'scheme-first',
      type: 'setColorScheme',
      scope: 'profile',
      method: 'PUT',
      endpoint: '/api/profile/color-scheme',
      dedupeKey: 'profile:color-scheme',
      timestamp: 5_000,
      payload: { colorScheme: 'dark' },
    }))

    enqueue(makeMutation({
      id: 'scheme-second',
      type: 'setColorScheme',
      scope: 'profile',
      method: 'PUT',
      endpoint: '/api/profile/color-scheme',
      dedupeKey: 'profile:color-scheme',
      timestamp: 1_000,
      payload: { colorScheme: 'light' },
    }))

    const queued = getAll()
    expect(queued).toHaveLength(1)
    expect(queued[0]?.id).toBe('scheme-second')
    expect(queued[0]?.payload).toEqual({ colorScheme: 'light' })
    expect(queued[0]?.timestamp).toBe(1_000)
  })

  it('orders same-entity updates by timestamp on read so the newest write replays last regardless of arrival order', () => {
    enqueue(makeMutation({
      id: 'update-newer',
      type: 'updateHabit',
      method: 'PUT',
      endpoint: '/api/habits/habit-1',
      targetEntityId: 'habit-1',
      timestamp: 9_000,
      payload: { title: 'Newest' },
    }))

    enqueue(makeMutation({
      id: 'update-older',
      type: 'updateHabit',
      method: 'PUT',
      endpoint: '/api/habits/habit-1',
      targetEntityId: 'habit-1',
      timestamp: 3_000,
      payload: { title: 'Older' },
    }))

    const queued = getAll()
    expect(queued.map((mutation) => mutation.id)).toEqual(['update-older', 'update-newer'])
    expect(queued[queued.length - 1]?.payload).toEqual({ title: 'Newest' })
  })
  it('parses and discards a persisted scheme mutation without sending a request', async () => {
    database.prepare(`INSERT INTO mutation_queue
      (id, timestamp, type, endpoint, method, payload, retries, max_retries, meta, account_id, owner_state)
      VALUES (?, ?, ?, ?, ?, ?, 0, 3, ?, ?, 'account')`).run(
      'persisted-scheme', Date.now(), 'setColorScheme', '/api/profile/color-scheme', 'PUT',
      JSON.stringify({ colorScheme: 'rose' }), JSON.stringify({ scope: 'profile' }), 'account-a',
    )

    expect(getAll()).toMatchObject([{
      id: 'persisted-scheme', type: 'setColorScheme', scope: 'profile', payload: { colorScheme: 'rose' },
    }])

    await expect(flushQueuedMutations()).resolves.toMatchObject({ remaining: 0 })

    expect(replayMocks.apiClient).not.toHaveBeenCalled()
    expect(database.prepare('SELECT id FROM mutation_queue').all()).toEqual([])
  })

  it('replays an already persisted reminder payload once without changing casing or ownership', async () => {
    const parsed = habitDetailSchema.parse(reminderWire.HabitDetailResponse)
    const payload = { title: 'Reminder', reminderEnabled: false,
      scheduledReminders: parsed.scheduledReminders, relativeReminders: parsed.relativeReminders }
    const bytes = JSON.stringify(payload)
    database.prepare(`INSERT INTO mutation_queue
      (id, timestamp, type, endpoint, method, payload, retries, max_retries, meta, account_id, owner_state)
      VALUES (?, ?, ?, ?, ?, ?, 0, 3, ?, ?, 'account')`).run(
      'persisted-reminder', Date.now(), 'updateHabit', '/api/habits/habit', 'PUT', bytes,
      JSON.stringify({ scope: 'habits', entityType: 'habit' }), 'account-a',
    )
    database.prepare(`INSERT INTO mutation_queue
      (id, timestamp, type, endpoint, method, payload, account_id, owner_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'account')`).run(
      'other-account-reminder', Date.now(), 'updateHabit', '/api/habits/other', 'PUT', bytes, 'account-b',
    )
    expect(getAll()).toHaveLength(1)
    expect(getAll()[0]?.payload).toEqual(payload)
    replayMocks.apiClient.mockResolvedValue(undefined)
    await expect(flushQueuedMutations()).resolves.toMatchObject({ succeeded: 1, remaining: 0 })
    await expect(flushQueuedMutations()).resolves.toMatchObject({ succeeded: 0, remaining: 0 })
    expect(replayMocks.apiClient).toHaveBeenCalledExactlyOnceWith('/api/habits/habit', {
      method: 'PUT', body: bytes, idempotencyKey: 'persisted-reminder',
    }, undefined)
    expect(database.prepare('SELECT id, payload, account_id FROM mutation_queue').all()).toEqual([
      { id: 'other-account-reminder', payload: bytes, account_id: 'account-b' },
    ])
    database.prepare('DELETE FROM mutation_queue WHERE id = ?').run('other-account-reminder')
    expect(habitDetailSchema.parse(reminderWire.HabitDetailResponse).relativeReminders).toEqual(payload.relativeReminders)
  })


  it('resolves source, chosen parent and tag through the actual persisted queue before one Update', async () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
    const temporary = ['offline-habit-source', 'offline-habit-parent', 'offline-tag-selected']
    for (const [index, clientEntityId] of temporary.entries()) {
      const tag = index === 2
      enqueueWithCompaction(makeMutation({ id: `create-${index}`, type: tag ? 'createTag' : 'createHabit', entityType: tag ? 'tag' : 'habit', scope: tag ? 'tags' : 'habits', endpoint: tag ? '/api/tags' : '/api/habits', clientEntityId, payload: { title: `Synthetic ${index}` } }))
      replayMocks.apiClient.mockResolvedValueOnce({ id: ids[index] })
    }
    const payload = { title: 'Together', isBadHabit: false, parentId: temporary[1], tagIds: [temporary[2]], goalIds: [], checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }] }
    enqueueWithCompaction(makeMutation({ id: 'one-update', type: 'updateHabit', endpoint: `/api/habits/${temporary[0]}`, method: 'PUT', targetEntityId: temporary[0], dependsOn: temporary, payload }))
    expect(getAll()).toHaveLength(4)
    replayMocks.apiClient.mockResolvedValueOnce(undefined)
    await expect(flushQueuedMutations()).resolves.toMatchObject({ succeeded: 4, remaining: 0 })
    expect(replayMocks.apiClient.mock.calls.map((call) => call[0])).toEqual(['/api/habits', '/api/habits', '/api/tags', `/api/habits/${ids[0]}`])
    expect(replayMocks.apiClient.mock.calls[3]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ ...payload, parentId: ids[1], tagIds: [ids[2]] }) })
  })

  it('replays Create A, parent update B and plain update C in order from the persisted queue', async () => {
    const source = 'offline-habit-source'
    const resolvedSource = '11111111-1111-4111-8111-111111111111'
    const parentId = '22222222-2222-4222-8222-222222222222'
    const create = { title: 'A' }
    const parentEdit = { title: 'B', isBadHabit: false, parentId, checklistItems: [{ text: 'Same', isChecked: false }], goalIds: [], tagIds: [] }
    const lastEdit = { title: 'C', isBadHabit: false, checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }], goalIds: ['33333333-3333-4333-8333-333333333333'], tagIds: ['44444444-4444-4444-8444-444444444444'] }
    enqueueWithCompaction(makeMutation({ id: 'create-a', timestamp: 1, clientEntityId: source, payload: create }))
    for (const [index, payload] of [parentEdit, lastEdit].entries()) {
      enqueueWithCompaction(makeMutation({ id: `edit-${index}`, timestamp: index + 2, type: 'updateHabit', method: 'PUT', endpoint: `/api/habits/${source}`, targetEntityId: source, dependsOn: [source], payload }))
    }
    const persisted = getAll()
    replayMocks.apiClient.mockResolvedValueOnce({ id: resolvedSource }).mockResolvedValue(undefined)
    const replay = await flushQueuedMutations()
    expect(replayMocks.apiClient.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify(lastEdit) })
    expect(persisted.map((entry) => entry.payload)).toEqual([create, parentEdit, lastEdit])
    expect(replay).toMatchObject({ succeeded: 3, remaining: 0 })
    expect(replayMocks.apiClient.mock.calls.map(([endpoint, options]) => [endpoint, options])).toEqual([
      ['/api/habits', { method: 'POST', body: JSON.stringify(create), idempotencyKey: 'create-a' }],
      [`/api/habits/${resolvedSource}`, { method: 'PUT', body: JSON.stringify(parentEdit), idempotencyKey: 'edit-0' }],
      [`/api/habits/${resolvedSource}`, { method: 'PUT', body: JSON.stringify(lastEdit), idempotencyKey: 'edit-1' }],
    ])
  })

  it('invalidates parent details only after a persisted parent update successfully replays', async () => {
    const parentId = '22222222-2222-4222-8222-222222222222'
    enqueueWithCompaction(makeMutation({ id: 'parent-update', type: 'updateHabit', method: 'PUT', endpoint: '/api/habits/source', targetEntityId: 'source', payload: { title: 'Read', isBadHabit: false, parentId } }))
    expect(replayMocks.invalidateQueries).not.toHaveBeenCalled()
    let finish!: () => void
    replayMocks.apiClient.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const replay = flushQueuedMutations()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(replayMocks.invalidateQueries).not.toHaveBeenCalled()
    finish()
    await expect(replay).resolves.toMatchObject({ succeeded: 1, remaining: 0 })
    expect(replayMocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.all })
  })


})

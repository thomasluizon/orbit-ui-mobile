import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { API } from '@orbit/shared/api'

const mocks = vi.hoisted(() => ({
  openDatabase: vi.fn(),
  writeSql: vi.fn(),
  fetch: vi.fn(),
  refreshSession: vi.fn(),
  online: true,
}))
vi.mock('expo-sqlite', () => ({ openDatabaseSync: mocks.openDatabase }))
vi.mock('@/lib/secure-store', () => ({ getToken: () => Promise.resolve('old-token') }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, sessionPhase: 'signed-in', user: { userId: 'account' } }), subscribe: () => () => {} },
  getSessionGeneration: () => ({ epoch: 1, credentialVersion: 0 }),
  isAuthTransitionInFlight: () => false,
  refreshSession: mocks.refreshSession,
}))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'account' }))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: () => Promise.resolve(mocks.online) }))
vi.mock('@/lib/offline-state', () => ({
  getResolvedEntityId: (_entity: string, id: string) => Promise.resolve(id),
  upsertOfflineEntity: vi.fn(), setOfflineEntityStatus: vi.fn(), resolveOfflineEntity: vi.fn(),
  clearOfflineEntity: vi.fn(), markOfflineTombstone: vi.fn(),
}))
vi.mock('@/lib/query-client', () => ({ persistQueryCache: vi.fn(), queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueriesData: () => [] } }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/stores/offline-sync-store', () => ({ useOfflineSyncStore: { getState: () => ({ addDrop: vi.fn() }) } }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } }))

let directory: string
let database: DatabaseSync
let cancelReplay: () => void

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  directory = mkdtempSync(join(tmpdir(), 'orbit-queue-'))
  database = new DatabaseSync(join(directory, 'queue.db'))
  mocks.openDatabase.mockImplementation(() => ({
    execSync: (sql: string) => database.exec(sql),
    runSync: (sql: string, parameters: SQLInputValue[] = []) => {
      mocks.writeSql(sql, parameters)
      return database.prepare(sql).run(...parameters)
    },
    getAllSync: (sql: string, parameters: SQLInputValue[] = []) => database.prepare(sql).all(...parameters),
    getFirstSync: (sql: string, parameters: SQLInputValue[] = []) => database.prepare(sql).get(...parameters) ?? null,
    withTransactionSync: (task: () => void) => {
      database.exec('BEGIN')
      try { task(); database.exec('COMMIT') } catch (error) { database.exec('ROLLBACK'); throw error }
    },
  }))
  mocks.fetch.mockReset()
  mocks.refreshSession.mockReset()
  mocks.online = true
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => {
  cancelReplay()
  database.close()
  rmSync(directory, { recursive: true })
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('restores queued writes after reopening the database and recovers a syncing row as failed', async () => {
  const queue = await import('@/lib/offline-queue')
  const replay = await import('@/lib/offline-mutations')
  cancelReplay = replay.cancelScheduledFlush
  const create = replay.buildQueuedMutation({ type: 'createHabit', scope: 'habits', endpoint: API.habits.create,
    method: 'POST', payload: { title: 'First' }, entityType: 'habit', clientEntityId: 'offline-habit-first' })
  const update = replay.buildQueuedMutation({ type: 'updateHabit', scope: 'habits', endpoint: API.habits.update('offline-habit-first'),
    method: 'PUT', payload: { title: 'Second' }, entityType: 'habit', targetEntityId: 'offline-habit-first', dependsOn: ['offline-habit-first'] })
  queue.enqueue(create)
  queue.update(create.id, { status: 'syncing' })
  queue.enqueue(update)
  const persisted = queue.getAll()
  database.close()
  vi.resetModules()
  database = new DatabaseSync(join(directory, 'queue.db'))
  const reopened = await import('@/lib/offline-queue')
  expect(reopened.getAll()).toEqual(persisted)
  expect(reopened.getAll()).toMatchObject([
    { id: create.id, clientEntityId: 'offline-habit-first', payload: create.payload, status: 'syncing' },
    { id: update.id, dependsOn: ['offline-habit-first'], payload: update.payload },
  ])
  mocks.writeSql.mockClear()
  mocks.fetch.mockRejectedValueOnce(new TypeError('Network request failed'))
  const restarted = await import('@/lib/offline-mutations')
  cancelReplay = restarted.cancelScheduledFlush
  await restarted.flushQueuedMutations()
  expect(reopened.getAll()).toMatchObject([{ id: create.id, status: 'failed' }, { id: update.id, status: 'pending' }])
  const firstRecoveryWrite = mocks.writeSql.mock.calls.find(([sql]) => sql.includes('INSERT OR REPLACE'))
  expect(JSON.parse(firstRecoveryWrite![1][8])).toMatchObject({ status: 'failed' })
  expect(firstRecoveryWrite![1][6]).toBe(0)
  expect(mocks.fetch).toHaveBeenCalledOnce()
})

it('replays same-timestamp writes in enqueue order after updates and a database reopen', async () => {
  const queue = await import('@/lib/offline-queue')
  const replay = await import('@/lib/offline-mutations')
  cancelReplay = replay.cancelScheduledFlush
  const mutations = ['z-last-alphabetically', 'a-first-alphabetically', 'middle'].map((id) => ({
    ...replay.buildQueuedMutation({ type: 'setName', scope: 'profile', endpoint: API.profile.name,
      method: 'PUT', payload: { name: id } }), id, timestamp: Date.now(),
  }))
  for (const mutation of mutations) queue.enqueue(mutation)
  queue.update(mutations[0]!.id, { status: 'failed', timestamp: Date.now() + 1 })
  queue.update(mutations[0]!.id, { timestamp: Date.now() })
  queue.update(mutations[1]!.id, { retries: 1 })
  expect(queue.getAll().map(({ id }) => id)).toEqual(mutations.map(({ id }) => id))
  database.close()
  vi.resetModules()
  database = new DatabaseSync(join(directory, 'queue.db'))
  const restarted = await import('@/lib/offline-mutations')
  cancelReplay = restarted.cancelScheduledFlush
  mocks.fetch.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
  await expect(restarted.flushQueuedMutations()).resolves.toMatchObject({ succeeded: 3, remaining: 0 })
  expect(mocks.fetch.mock.calls.map(([, options]) => options.headers['Idempotency-Key'])).toEqual(mutations.map(({ id }) => id))
})

it('replays a 401 through token refresh using the original idempotency key and accepts one write', async () => {
  const queue = await import('@/lib/offline-queue')
  const replay = await import('@/lib/offline-mutations')
  cancelReplay = replay.cancelScheduledFlush
  const mutation = replay.buildQueuedMutation({ type: 'setName', scope: 'profile', endpoint: API.profile.name,
    method: 'PUT', payload: { name: 'Changed' } })
  queue.enqueue(mutation)
  mocks.refreshSession.mockResolvedValueOnce({ status: 'network-error' }).mockResolvedValueOnce({ status: 'refreshed', token: 'new-token' })
  const acceptedKeys: string[] = []
  mocks.fetch.mockImplementation((_url, options) => {
    if (options.headers.Authorization !== 'Bearer new-token') return Promise.resolve(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    acceptedKeys.push(options.headers['Idempotency-Key'])
    return Promise.resolve(new Response(null, { status: 204 }))
  })
  await expect(replay.flushQueuedMutations()).resolves.toMatchObject({ remaining: 1, replayState: 'waiting-on-backoff' })
  expect(queue.getAll()).toMatchObject([{ id: mutation.id, retries: 0 }])
  await vi.advanceTimersByTimeAsync(2_000)
  expect(mocks.refreshSession).toHaveBeenCalledTimes(2)
  expect(mocks.fetch).toHaveBeenCalledTimes(3)
  expect(mocks.fetch.mock.calls.map(([, options]) => options.headers['Idempotency-Key'])).toEqual([mutation.id, mutation.id, mutation.id])
  expect(acceptedKeys).toEqual([mutation.id])
  expect(queue.getAll()).toEqual([])
})

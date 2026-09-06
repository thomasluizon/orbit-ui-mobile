import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQLInputValue } from 'node:sqlite'
import { API } from '@orbit/shared/api'
import * as auth from '@/stores/auth-store'
import * as queue from '@/lib/offline-queue'
import { cancelScheduledFlush, flushQueuedMutations } from '@/lib/offline-mutations'

const mocks = await vi.hoisted(async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const database = new DatabaseSync(':memory:')
  database.exec(`CREATE TABLE mutation_queue (
    id TEXT PRIMARY KEY NOT NULL, timestamp INTEGER NOT NULL, type TEXT NOT NULL,
    endpoint TEXT NOT NULL, method TEXT NOT NULL, payload TEXT,
    retries INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 3
  ); INSERT INTO mutation_queue VALUES ('legacy', 1, 'deleteHabit', '/api/habits/legacy', 'DELETE', 'null', 2, 3);`)
  return {
    database,
    fetch: vi.fn(), clearTokens: vi.fn(), token: 'expired-access',
  }
})

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => mocks.database.exec(sql),
    runSync: (sql: string, params: SQLInputValue[] = []) => { mocks.database.prepare(sql).run(...params) },
    getAllSync: (sql: string, params: SQLInputValue[] = []) => mocks.database.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: SQLInputValue[] = []) => mocks.database.prepare(sql).get(...params) ?? null,
    withTransactionSync: (task: () => void) => {
      mocks.database.exec('BEGIN')
      try { task(); mocks.database.exec('COMMIT') }
      catch (error) { mocks.database.exec('ROLLBACK'); throw error }
    },
  }),
}))
vi.mock('@/lib/secure-store', () => ({
  getToken: () => Promise.resolve(mocks.token),
  setToken: (token: string) => { mocks.token = token; return Promise.resolve() },
  getRefreshToken: () => Promise.resolve('refresh-token'), setRefreshToken: vi.fn(),
  clearRefreshToken: vi.fn(), clearAllTokens: mocks.clearTokens,
}))
vi.mock('@/lib/orbit-widget', () => ({ clearWidgetToken: async () => {}, saveWidgetToken: async () => {} }))
vi.mock('@/lib/persistent-reminder', () => ({ cancelPersistentReminder: async () => {} }))
vi.mock('@/hooks/use-push-notifications', () => ({ unsubscribePushToken: async () => {} }))
vi.mock('@/lib/auth-flow', () => ({ clearStoredAuthReturnUrl: async () => {} }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/lib/query-client', () => ({
  queryClient: { clear: vi.fn(), setQueryData: vi.fn(), invalidateQueries: vi.fn(), getQueriesData: () => [] },
  clearPersistedQueryCache: async () => {}, setQueryCacheScope: async () => {}, persistQueryCache: async () => {},
}))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: () => Promise.resolve(true) }))
vi.mock('@/stores/chat-store', () => ({ useChatStore: { getState: () => ({ clearMessages: vi.fn() }) } }))
vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }))

const account = { userId: 'account-a', email: 'person@example.com', name: 'Person' }
function authenticate(userId: string | null) {
  auth.useAuthStore.setState({ isAuthenticated: userId !== null, user: userId ? { ...account, userId } : null })
}
function enqueue(id = 'queued-delete') {
  queue.enqueue({ id, timestamp: Date.now(), type: 'deleteHabit', endpoint: API.habits.delete(id), method: 'DELETE', payload: null, retries: 2, maxRetries: 3 })
}
function stored() {
  return mocks.database.prepare('SELECT * FROM mutation_queue ORDER BY id').all()
}
async function login(userId = account.userId) {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }))
  await auth.useAuthStore.getState().login('new-access', 'new-refresh', { ...account, userId })
}

it('migrates the legacy queue in place without losing its unowned write', () => {
  authenticate(account.userId)
  expect(queue.getAll()).toMatchObject([{ id: 'legacy', retries: 2 }])
  expect(stored()).toMatchObject([{ id: 'legacy', account_id: null, meta: null }])
})

describe('offline queue across the real API and auth boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.clearTokens.mockClear()
    mocks.token = 'expired-access'
    cancelScheduledFlush()
    authenticate(account.userId)
    queue.clear()
  })
  afterEach(() => { cancelScheduledFlush(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('retains both writes through terminal 401 teardown and same-account login', async () => {
    enqueue()
    enqueue('later-delete')
    const clearSession = vi.spyOn(auth, 'clearSessionAndResetAuth')
    mocks.fetch.mockResolvedValue(new Response(null, { status: 401 }))
    await flushQueuedMutations()
    expect(clearSession).toHaveBeenCalledOnce()
    expect(auth.useAuthStore.getState().isAuthenticated).toBe(false)
    expect(mocks.clearTokens).toHaveBeenCalledOnce()
    expect(stored()).toHaveLength(2)
    expect(queue.getAll()).toEqual([])
    expect(queue.dequeue()).toBeNull()
    expect(queue.count()).toBe(0)
    await login()
    expect(queue.getAll().map((row) => row.id).sort()).toEqual(['later-delete', 'queued-delete'])
    expect(queue.getAll().every((row) => row.retries === 2)).toBe(true)
  })

  it('prunes other accounts on login while adopting unowned writes', async () => {
    enqueue('account-a-delete')
    authenticate(null)
    enqueue('pre-login-delete')
    await login('account-b')
    expect(queue.getAll().map((row) => row.id)).toEqual(['pre-login-delete'])
    expect(stored()).toMatchObject([{ id: 'pre-login-delete', account_id: 'account-b' }])
    authenticate(account.userId)
    expect(queue.count()).toBe(0)
  })

  it('hides retained writes without a session and isolates queue compaction and updates', async () => {
    enqueue('account-a-delete')
    authenticate(null)
    expect(queue.count()).toBe(0)
    expect(queue.getAll()).toEqual([])
    await flushQueuedMutations()
    expect(mocks.fetch).not.toHaveBeenCalled()
    authenticate('account-b')
    enqueue('account-b-delete')
    queue.update('account-b-delete', { retries: 1 })
    queue.remove('account-a-delete')
    expect(queue.getAll().map((row) => row.id)).toEqual(['account-b-delete'])
    authenticate(account.userId)
    expect(queue.getAll()).toMatchObject([{ id: 'account-a-delete', retries: 2 }])
  })

  it('notifies queue subscribers when the session account changes', () => {
    enqueue()
    const listener = vi.fn()
    const unsubscribe = queue.subscribeQueueCount(listener)
    authenticate(null)
    expect(listener).toHaveBeenLastCalledWith(0)
    authenticate(account.userId)
    expect(listener).toHaveBeenLastCalledWith(1)
    unsubscribe()
  })

  it('deduplicates pre-login logs while keeping them hidden until authentication', async () => {
    authenticate(null)
    const mutation = { id: 'first-log', timestamp: 1, type: 'logHabit' as const, endpoint: '/api/habits/walk/log', method: 'POST' as const, payload: null, dedupeKey: 'walk-today' }
    queue.enqueue(mutation)
    expect(queue.enqueue({ ...mutation, id: 'second-log' })).toBe('first-log')
    expect(queue.count()).toBe(0)
    await login()
    expect(queue.getAll().map((row) => row.id)).toEqual(['first-log'])
  })

  it('explicit logout deletes retained work even after the session expired', async () => {
    enqueue()
    await auth.clearSessionAndResetAuth()
    expect(stored()).toHaveLength(1)
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }))
    await auth.useAuthStore.getState().logout()
    expect(stored()).toEqual([])
  })

  it('retains a forbidden write after reauthentication without spending a retry', async () => {
    enqueue()
    await auth.clearSessionAndResetAuth()
    await login()
    expect(queue.count()).toBe(1)
    mocks.clearTokens.mockClear()
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }))
    await flushQueuedMutations()
    expect(queue.getAll()).toMatchObject([{ retries: 2 }])
    expect(mocks.clearTokens).not.toHaveBeenCalled()
  })

  it('retries automatically after a transient refresh network failure', async () => {
    enqueue()
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue(new Response(null, { status: 204 }))
    await flushQueuedMutations()
    expect(auth.useAuthStore.getState().isAuthenticated).toBe(true)
    expect(queue.getAll()).toMatchObject([{ retries: 2 }])
    await vi.advanceTimersByTimeAsync(2_000)
    expect(queue.count()).toBe(0)
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(mocks.clearTokens).not.toHaveBeenCalled()
  })
})

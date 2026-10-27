import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQLInputValue } from 'node:sqlite'
import { QueryClientProvider } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { useBulkDeleteHabits } from '@/hooks/use-habits'
import { cancelScheduledFlush, flushQueuedMutations, getReplayState } from '@/lib/offline-mutations'
import { clear, getAll } from '@/lib/offline-queue'
import { clearOfflineState } from '@/lib/offline-state'
import { queryClient } from '@/lib/query-client'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'

const mocks = await vi.hoisted(async () => {
  const { DatabaseSync } = await import('node:sqlite')
  return {
    database: new DatabaseSync(':memory:'),
    online: false,
    fetch: vi.fn<typeof fetch>(),
    showUndoToast: vi.fn(),
    showError: vi.fn(),
    captureError: vi.fn(),
  }
})

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => mocks.database.exec(sql),
    runSync: (sql: string, params: SQLInputValue[] = []) => mocks.database.prepare(sql).run(...params),
    getAllSync: (sql: string, params: SQLInputValue[] = []) => mocks.database.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: SQLInputValue[] = []) => mocks.database.prepare(sql).get(...params) ?? null,
    withTransactionSync: (task: () => void) => {
      mocks.database.exec('BEGIN')
      try { task(); mocks.database.exec('COMMIT') }
      catch (error) { mocks.database.exec('ROLLBACK'); throw error }
    },
  }),
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }) },
  getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
}))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'account-a' }))
vi.mock('@/lib/secure-store', () => ({ getToken: () => Promise.resolve('access-token') }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: () => Promise.resolve(mocks.online) }))
vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return {
    queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
    persistQueryCache: vi.fn(async () => {}),
  }
})
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: async () => {} }))
vi.mock('@/lib/posthog', () => ({ captureHabitLogged: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: mocks.captureError }))
vi.mock('@/hooks/use-undo-toast', () => ({ useUndoToast: () => mocks.showUndoToast }))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError, showSuccess: vi.fn() }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

let mutation: ReturnType<typeof useBulkDeleteHabits>
let renderer: ReactTestRenderer
const habitIds = ['habit-1', 'habit-2']

function BulkDeleteOwner() {
  mutation = useBulkDeleteHabits()
  return null
}

async function mount(habits = habitIds.map((id) => createMockHabitScheduleItem({ id }))) {
  queryClient.setQueryData(habitKeys.list({}), habits)
  await act(() => {
    renderer = create(<QueryClientProvider client={queryClient}><BulkDeleteOwner /></QueryClientProvider>)
  })
}

function cachedIds() {
  return queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.map((habit) => habit.id)
}

async function deleteSelected(ids = [...habitIds]) {
  let outcome: Awaited<ReturnType<typeof mutation.mutateAsync>> | undefined
  await act(async () => { outcome = await mutation.mutateAsync(ids) })
  return outcome!
}

function serveDeletes(serverHabits: Set<string>, loseAcknowledgement = false) {
  const deletions = new Map<string, number>()
  mocks.fetch.mockImplementation((input, options) => {
    const url = input instanceof Request ? input.url : input.toString()
    const habitId = url.split('/').at(-1)!
    expect(options?.method).toBe('DELETE')
    if (!serverHabits.delete(habitId)) {
      return Promise.resolve(Response.json({ error: 'Habit not found.', errorCode: 'HABIT_NOT_FOUND' }, { status: 404 }))
    }
    deletions.set(habitId, (deletions.get(habitId) ?? 0) + 1)
    if (loseAcknowledgement) return Promise.reject(new TypeError('Network request failed'))
    return Promise.resolve(new Response(null, { status: 204 }))
  })
  return deletions
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', mocks.fetch)
  vi.useFakeTimers()
  cancelScheduledFlush()
  clear()
  await clearOfflineState()
  queryClient.clear()
  mocks.online = false
  vi.clearAllMocks()
})

afterEach(async () => {
  await act(() => renderer.update(<></>))
  cancelScheduledFlush()
  queryClient.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('offline bulk delete through the native queue', () => {
  it('defers two childless deletes, keeps them removed, and replays each once with its own key', async () => {
    await mount()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const outcome = await deleteSelected()
    const queued = getAll()
    expect(outcome.offlineFailureIds).toEqual([])
    expect(queued).toHaveLength(2)
    expect(queued.map((item) => [item.type, item.endpoint])).toEqual(
      habitIds.map((id) => ['deleteHabit', API.habits.delete(id)]),
    )
    expect(cachedIds()).toEqual([])
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(mocks.showUndoToast).toHaveBeenCalledOnce()
    expect(mocks.fetch).not.toHaveBeenCalled()

    const serverHabits = new Set(habitIds)
    const deletions = serveDeletes(serverHabits)
    mocks.online = true
    expect(await flushQueuedMutations()).toMatchObject({ succeeded: 2, failed: 0, remaining: 0 })
    await flushQueuedMutations()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    for (const item of queued) {
      expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining(item.endpoint), expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': item.id }),
      }))
    }
    expect([...deletions.values()]).toEqual([1, 1])
    expect(serverHabits.size).toBe(0)
    expect(cachedIds()).toEqual([])
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(mocks.showError).not.toHaveBeenCalled()
    invalidate.mockRestore()
  })

  it.each([false, true])('settles lost acknowledgements on timed replay when initially online=$0', async (initiallyOnline) => {
    await mount()
    const serverHabits = new Set(habitIds)
    const deletions = serveDeletes(serverHabits, true)
    mocks.online = initiallyOnline
    await deleteSelected()
    const queued = getAll()
    expect(queued).toHaveLength(2)
    mocks.online = true
    await flushQueuedMutations()
    expect(getReplayState()).toBe(initiallyOnline ? 'idle' : 'waiting-on-backoff')
    if (!initiallyOnline) {
      await vi.advanceTimersByTimeAsync(2_000)
      await vi.advanceTimersByTimeAsync(4_000)
    }
    expect(getAll()).toEqual([])
    expect(serverHabits.size).toBe(0)
    expect([...deletions.values()]).toEqual([1, 1])
    for (const item of queued) {
      const attempts = mocks.fetch.mock.calls.filter(([url]) =>
        (url instanceof Request ? url.url : url.toString()).endsWith(item.endpoint),
      )
      expect(attempts).toHaveLength(2)
      expect(attempts.map(([, options]) => options?.headers)).toEqual([
        expect.objectContaining({ 'Idempotency-Key': item.id }),
        expect.objectContaining({ 'Idempotency-Key': item.id }),
      ])
    }
    expect(cachedIds()).toEqual([])
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(mocks.captureError).not.toHaveBeenCalled()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('replays a persisted in-flight delete after relaunch while its acknowledgement is delayed', async () => {
    await mount()
    await deleteSelected()
    const queued = getAll()
    const serverHabits = new Set(habitIds)
    const deletions = serveDeletes(serverHabits)
    let acknowledge: (() => void) | undefined
    mocks.fetch.mockImplementationOnce(() => {
      serverHabits.delete(habitIds[0]!)
      return new Promise((resolve) => { acknowledge = () => resolve(new Response(null, { status: 204 })) })
    })
    mocks.online = true
    const interruptedFlush = flushQueuedMutations()
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(getAll()[0]?.status).toBe('syncing')
    try {
      await act(() => renderer.update(<></>))
      vi.resetModules()
      const relaunched = await import('@/lib/offline-mutations')
      expect(await relaunched.flushQueuedMutations()).toMatchObject({ succeeded: 2, failed: 0, remaining: 0, droppedMutations: [] })
      expect(getAll()).toEqual([])
      expect(serverHabits.size).toBe(0)
      expect(deletions.get(habitIds[1]!)).toBe(1)
      expect(mocks.fetch).toHaveBeenCalledTimes(3)
      const firstAttempts = mocks.fetch.mock.calls.slice(0, 2)
      expect(firstAttempts.map(([, options]) => options?.headers)).toEqual([
        expect.objectContaining({ 'Idempotency-Key': queued[0]!.id }),
        expect.objectContaining({ 'Idempotency-Key': queued[0]!.id }),
      ])
      expect(cachedIds()).toEqual([])
      expect(mocks.captureError).not.toHaveBeenCalled()
      relaunched.cancelScheduledFlush()
    } finally {
      acknowledge?.()
      await interruptedFlush
    }
  })

  it.each([
    { children: [createMockHabitScheduleChild()], hasSubHabits: true },
    { children: [], hasSubHabits: true },
    { children: [createMockHabitScheduleChild()], hasSubHabits: false },
  ])('refuses the entire selection offline when a parent has $children.length loaded children and hasSubHabits=$hasSubHabits', async (parent) => {
    await mount([
      createMockHabitScheduleItem({ id: habitIds[0], ...parent }),
      createMockHabitScheduleItem({ id: habitIds[1] }),
    ])
    const outcome = await deleteSelected()
    expect(outcome.offlineFailureIds).toEqual(habitIds)
    expect(getAll()).toEqual([])
    expect(cachedIds()).toEqual(habitIds)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.showUndoToast).not.toHaveBeenCalled()
  })

  it('undoes deferred deletes locally before any request is sent', async () => {
    await mount()
    await deleteSelected()
    expect(cachedIds()).toEqual([])
    const undo = mocks.showUndoToast.mock.calls[0]![1] as () => void
    await act(() => { undo() })
    expect(getAll()).toEqual([])
    expect(cachedIds()).toEqual(habitIds)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('defers a childless descendant even when its unselected parent has sub-habits', async () => {
    await mount([createMockHabitScheduleItem({
      id: 'parent', hasSubHabits: true,
      children: [createMockHabitScheduleChild({ id: 'child' })],
    })])
    expect((await deleteSelected(['child'])).offlineFailureIds).toEqual([])
    expect(getAll()).toMatchObject([{ type: 'deleteHabit', targetEntityId: 'child' }])
    expect(queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.[0]?.children).toEqual([])
  })

  it('requires a connection when the selection has no cached hierarchy', async () => {
    await mount([])
    expect((await deleteSelected()).offlineFailureIds).toEqual(habitIds)
    expect(getAll()).toEqual([])
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

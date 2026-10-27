import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQLInputValue } from 'node:sqlite'
import { QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { habitDetailSchema, type HabitScheduleItem } from '@orbit/shared/types/habit'
import { OfflineNotice } from '@/components/offline-notice'
import { Toast } from '@/components/ui/app-toast'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { useBulkDeleteHabits, useDeleteHabit } from '@/hooks/use-habits'
import { useHabitDetail, useHabitFullDetail, useHabitLogs, useHabitMetrics } from '@/hooks/use-habit-queries'
import { cancelScheduledFlush, flushQueuedMutations, getReplayState } from '@/lib/offline-mutations'
import { clear, getAll, update } from '@/lib/offline-queue'
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
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
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
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mocks.online, pendingCount: 0, isFlushing: false, hasFailed: false }),
}))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: (props: Record<string, unknown>) => React.createElement('ConfirmSheet', props),
}))
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
    renderer = create(<QueryClientProvider client={queryClient}><BulkDeleteOwner /><OfflineNotice /></QueryClientProvider>)
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
    if (options?.method === 'GET') {
      return Promise.resolve(serverHabits.has(habitId)
        ? Response.json(habitDetailSchema.parse(createMockHabitScheduleItem({ id: habitId })))
        : Response.json({ error: 'Habit not found.', errorCode: 'HABIT_NOT_FOUND' }, { status: 404 }))
    }
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
  it.each(['detail', 'row menu', 'selection'] as const)('does not request a deleted habit after online %s delete', async (entry) => {
    mocks.online = true
    const habit = createMockHabitScheduleItem({ id: 'habit-1' })
    const keys = [habitKeys.detail(habit.id), habitKeys.fullDetail(habit.id), habitKeys.logs(habit.id), habitKeys.metrics(habit.id)]
    const detail = habitDetailSchema.parse(habit)
    const metrics = { currentStreak: 0, longestStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 0, totalCompletions: 0, lastCompletedDate: null }
    for (const key of keys) queryClient.setQueryData(key, key[1] === 'logs' ? [] : key[1] === 'metrics' ? metrics : key[1] === 'fullDetail' ? { habit: detail, metrics, logs: [] } : detail)
    queryClient.setQueryData(habitKeys.list({}), [habit])
    serveDeletes(new Set([habit.id]))
    let single!: ReturnType<typeof useDeleteHabit>
    function DeleteOwner() {
      single = useDeleteHabit()
      mutation = useBulkDeleteHabits()
      useHabitDetail(habit.id)
      useHabitFullDetail(habit.id)
      useHabitLogs(habit.id)
      useHabitMetrics(habit.id)
      return null
    }
    await act(() => { renderer = create(<QueryClientProvider client={queryClient}><DeleteOwner /></QueryClientProvider>) })
    await act(async () => {
      if (entry === 'selection') await mutation.mutateAsync([habit.id])
      else await single.mutateAsync(habit.id)
    })
    await act(async () => {
      renderer.update(<QueryClientProvider client={queryClient}><DeleteOwner /></QueryClientProvider>)
      await queryClient.invalidateQueries({ queryKey: habitKeys.all })
    })
    expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['DELETE'])
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(mocks.showUndoToast).toHaveBeenCalled()
    for (const key of keys) expect(queryClient.getQueryData(key)).toBeUndefined()
    expect(cachedIds()).toEqual([])
  })

  it('keeps the error from another device deletion available to the caller', async () => {
    mocks.online = true
    const habit = createMockHabitScheduleItem({ id: 'remote' })
    queryClient.setQueryData(habitKeys.list({}), [habit])
    let single!: ReturnType<typeof useDeleteHabit>
    function DeleteOwner() { single = useDeleteHabit(); return null }
    await act(() => { renderer = create(<QueryClientProvider client={queryClient}><DeleteOwner /></QueryClientProvider>) })
    serveDeletes(new Set())
    await act(async () => {
      await expect(single.mutateAsync('remote')).rejects.toMatchObject({ status: 404, code: 'HABIT_NOT_FOUND' })
    })
    expect(mocks.showUndoToast).not.toHaveBeenCalled()
    expect(cachedIds()).toEqual(['remote'])
    const { isCachedHabitDeleted } = await import('@orbit/shared/query')
    expect(isCachedHabitDeleted(queryClient, 'remote')).toBe(false)
  })

  it.each([
    { alreadyMissing: false, withoutEntityType: false },
    { alreadyMissing: true, withoutEntityType: false },
    { alreadyMissing: false, withoutEntityType: true },
    { alreadyMissing: true, withoutEntityType: true },
  ])('retires active habit queries when replay settles missing=$alreadyMissing legacy=$withoutEntityType', async ({ alreadyMissing, withoutEntityType }) => {
    await mount([createMockHabitScheduleItem({ id: 'habit-1' })])
    await deleteSelected(['habit-1'])
    if (withoutEntityType) update(getAll()[0]!.id, { entityType: undefined })
    const queryKey = habitKeys.detail('habit-1')
    queryClient.setQueryData(queryKey, habitDetailSchema.parse(createMockHabitScheduleItem({ id: 'habit-1' })))
    const request = vi.fn(() => Promise.reject(new Error('Deleted habit was refetched')))
    const observer = new QueryObserver(queryClient, { queryKey, queryFn: request, staleTime: Infinity, retry: false })
    const unsubscribe = observer.subscribe(() => {})
    serveDeletes(new Set(alreadyMissing ? [] : ['habit-1']))
    mocks.online = true
    try {
      await act(async () => { expect(await flushQueuedMutations()).toMatchObject({ succeeded: 1, failed: 0, remaining: 0 }) })
      expect(request).not.toHaveBeenCalled()
      expect(queryClient.getQueryData(queryKey)).toBeUndefined()
    } finally { unsubscribe() }
  })

  it('refuses replay of a General parent with a retained completed one-time child and restores its row', async () => {
    const generalParent = createMockHabitScheduleItem({
      id: habitIds[0], schedule: 'General', isGeneral: true, frequencyUnit: null,
      frequencyQuantity: null, children: [], hasSubHabits: false,
    })
    await mount([generalParent])
    const observer = new QueryObserver(queryClient, {
      queryKey: habitKeys.list({}), queryFn: () => Promise.resolve([generalParent]), staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await deleteSelected([generalParent.id])
      expect(getAll()).toHaveLength(1)
      expect(cachedIds()).toEqual([])
      const child = createMockHabitScheduleChild({
        schedule: 'OneTime', isCompleted: true, frequencyUnit: null, frequencyQuantity: null,
      })
      const detail = habitDetailSchema.parse({ ...generalParent, children: [child] })
      mocks.fetch.mockResolvedValue(Response.json(detail))
      mocks.online = true
      let result: Awaited<ReturnType<typeof flushQueuedMutations>> | undefined
      await act(async () => { result = await flushQueuedMutations() })
      expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET'])
      expect(result).toMatchObject({ succeeded: 0, failed: 1, remaining: 0 })
      expect(cachedIds()).toEqual([generalParent.id])
      expect(useOfflineSyncStore.getState().drops).toHaveLength(1)
      const notice = renderer.root.findAll((node) => node.type === Toast)[0]!
      expect(notice.props.message).toBe('habits.detail.deleteError')
      expect(notice.props.actionLabel).toBe('common.syncRetryAction')
      await act(() => { (notice.props.onAction as () => void)() })
      const confirmation = renderer.root.findAll((node) => node.type === ConfirmSheet)[0]!
      expect(confirmation.props).toMatchObject({ open: true, message: 'habits.deleteConfirmMessage', destructive: true })
      expect(mocks.fetch).toHaveBeenCalledOnce()
      mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }))
      await act(async () => { (confirmation.props.onConfirm as () => void)(); await vi.advanceTimersByTimeAsync(0) })
      expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET', 'DELETE'])
      expect(useOfflineSyncStore.getState().drops).toEqual([])
      expect(mocks.showUndoToast).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe()
    }
  })

  it('lets the person keep a refused habit by dismissing the notice, with no delete sent', async () => {
    const generalParent = createMockHabitScheduleItem({
      id: habitIds[0], schedule: 'General', isGeneral: true, frequencyUnit: null,
      frequencyQuantity: null, children: [], hasSubHabits: false,
    })
    await mount([generalParent])
    await deleteSelected([generalParent.id])
    const child = createMockHabitScheduleChild({
      schedule: 'OneTime', isCompleted: true, frequencyUnit: null, frequencyQuantity: null,
    })
    mocks.fetch.mockResolvedValue(Response.json(habitDetailSchema.parse({ ...generalParent, children: [child] })))
    mocks.online = true
    await act(async () => { await flushQueuedMutations() })
    const [refusal] = useOfflineSyncStore.getState().drops
    const laterDrop = { ...refusal!, id: 'later-drop', mutation: { ...refusal!.mutation, id: 'later-mutation', payload: null } }
    await act(() => { useOfflineSyncStore.getState().addDrop(laterDrop) })
    const notice = renderer.root.findAll((node) => node.type === Toast)[0]!
    expect(notice.props.message).toBe('habits.detail.deleteError')
    await act(() => { (notice.props.onAction as () => void)() })
    const confirmation = renderer.root.findAll((node) => node.type === ConfirmSheet)[0]!
    await act(() => { (confirmation.props.onCancel as () => void)() })
    const dismissible = renderer.root.findAll((node) => node.type === Toast)[0]!
    expect(dismissible.props.onDismiss).toEqual(expect.any(Function))
    await act(() => { (dismissible.props.onDismiss as () => void)() })
    expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET'])
    expect(useOfflineSyncStore.getState().drops.map((drop) => drop.id)).toEqual(['later-drop'])
    expect(renderer.root.findAll((node) => node.type === Toast)[0]!.props.message).not.toBe('habits.detail.deleteError')
  })

  it('settles a replay hierarchy read answered HABIT_NOT_FOUND without sending a delete', async () => {
    await mount()
    await deleteSelected([habitIds[0]!])
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Habit not found.', errorCode: 'HABIT_NOT_FOUND' }, { status: 404 }))
    mocks.online = true
    expect(await flushQueuedMutations()).toMatchObject({ succeeded: 1, failed: 0, remaining: 0 })
    expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET'])
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(mocks.captureError).not.toHaveBeenCalled()
  })

  it('keeps a failed hierarchy read queued and checks it again on timed replay', async () => {
    await mount()
    await deleteSelected([habitIds[0]!])
    const queued = getAll()[0]!
    mocks.fetch.mockRejectedValue(new TypeError('Network request failed'))
    mocks.online = true
    expect(await flushQueuedMutations()).toMatchObject({ succeeded: 0, failed: 0, remaining: 1, replayState: 'waiting-on-backoff' })
    expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET'])
    expect(getAll()).toMatchObject([{ id: queued.id, status: 'failed' }])
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    serveDeletes(new Set([habitIds[0]!]))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET', 'GET', 'DELETE'])
    expect(getAll()).toEqual([])
    expect(mocks.captureError).not.toHaveBeenCalled()
  })

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
    expect(queued.map((item) => item.payload)).toEqual(habitIds.map(() => ({ queuedAsChildless: true })))
    expect(cachedIds()).toEqual([])
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(mocks.showUndoToast).toHaveBeenCalledOnce()
    expect(mocks.fetch).not.toHaveBeenCalled()

    const serverHabits = new Set(habitIds)
    const deletions = serveDeletes(serverHabits)
    mocks.online = true
    expect(await flushQueuedMutations()).toMatchObject({ succeeded: 2, failed: 0, remaining: 0 })
    await flushQueuedMutations()
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
    expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET', 'DELETE', 'GET', 'DELETE'])
    for (const item of queued) {
      expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining(item.endpoint), expect.objectContaining({
        method: 'DELETE', body: undefined,
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
      expect(attempts.map(([, options]) => options?.method)).toEqual(initiallyOnline ? ['DELETE', 'GET'] : ['GET', 'DELETE', 'GET'])
      expect(attempts.filter(([, options]) => options?.method === 'DELETE').map(([, options]) => options?.headers)).toEqual([
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
    mocks.fetch.mockResolvedValueOnce(Response.json(habitDetailSchema.parse(createMockHabitScheduleItem({ id: habitIds[0] }))))
    mocks.fetch.mockImplementationOnce(() => {
      serverHabits.delete(habitIds[0]!)
      return new Promise((resolve) => { acknowledge = () => resolve(new Response(null, { status: 204 })) })
    })
    mocks.online = true
    const interruptedFlush = flushQueuedMutations()
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    expect(getAll()[0]?.status).toBe('syncing')
    try {
      await act(() => renderer.update(<></>))
      vi.resetModules()
      const relaunched = await import('@/lib/offline-mutations')
      expect(await relaunched.flushQueuedMutations()).toMatchObject({ succeeded: 2, failed: 0, remaining: 0, droppedMutations: [] })
      expect(getAll()).toEqual([])
      expect(serverHabits.size).toBe(0)
      expect(deletions.get(habitIds[1]!)).toBe(1)
      expect(mocks.fetch).toHaveBeenCalledTimes(5)
      expect(mocks.fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['GET', 'DELETE', 'GET', 'GET', 'DELETE'])
      expect(mocks.fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE').map(([, options]) => options?.headers)).toEqual([
        expect.objectContaining({ 'Idempotency-Key': queued[0]!.id }),
        expect.objectContaining({ 'Idempotency-Key': queued[1]!.id }),
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

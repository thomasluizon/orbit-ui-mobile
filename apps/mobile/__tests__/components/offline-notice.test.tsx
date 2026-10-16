import React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { Pressable, StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import HabitCreateRoute from '@/app/habits/new'
import { useAppToastNavigation } from '@/hooks/use-app-toast-navigation'
import { OfflineNotice } from '@/components/offline-notice'
import { Shell412 } from '@/components/shell/shell-412'
import { Toast } from '@/components/ui/app-toast'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import type { DroppedMutation } from '@/lib/offline-mutations'
import { accountTimezoneDependency, buildQueuedMutation, flushQueuedMutations, cancelScheduledFlush } from '@/lib/offline-mutations'
import type { PersistedQueuedMutation } from '@orbit/shared/types/sync'

const TestRenderer = require('react-test-renderer')
interface RenderTree {
  update: (element: React.ReactNode) => void
  unmount: () => void
  root: {
    findAllByProps: (props: Record<string, unknown>) => { props: Record<string, unknown> }[]
    findByType: (type: unknown) => { props: Record<string, unknown> }
    findAllByType: (type: unknown) => { props: Record<string, unknown> }[]
  }
}
const mocks = vi.hoisted(() => {
  const params: Record<string, string> = {}
  return ({
  storage: new Map<string, string>(),
  queue: { isOnline: false, pendingCount: 0, isFlushing: false, hasFailed: false },
  enqueue: vi.fn((mutation: PersistedQueuedMutation) => { mocks.queued.push(mutation); return mutation.id }),
  apiClient: vi.fn((_endpoint: string) => Promise.resolve(null)),
  queued: [] as PersistedQueuedMutation[],
  push: vi.fn(),
  back: vi.fn(),
  params,
  translate: (key: string, values?: Record<string, unknown>) => key + JSON.stringify(values),
})
})
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: (key: string) => Promise.resolve(mocks.storage.get(key) ?? null),
  setItem: (key: string, value: string) => { mocks.storage.set(key, value); return Promise.resolve() },
  removeItem: (key: string) => { mocks.storage.delete(key); return Promise.resolve() },
} }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => mocks.queue }))
vi.mock('@/lib/offline-queue', () => ({
  enqueue: mocks.enqueue,
  enqueueWithCompaction: (mutation: PersistedQueuedMutation) => ({ id: mutation.id, compactedCreate: null }),
  getAll: () => [...mocks.queued],
  getById: (id: string) => mocks.queued.find((mutation) => mutation.id === id) ?? null,
  count: () => mocks.queued.length,
  remove: (id: string) => { mocks.queued.splice(mocks.queued.findIndex((mutation) => mutation.id === id), 1) },
  update: (id: string, patch: Partial<PersistedQueuedMutation>) => {
    const mutation = mocks.queued.find((entry) => entry.id === id)
    if (mutation) Object.assign(mutation, patch)
  },
  ACCOUNT_TIMEZONE_DEPENDENCY: 'offline-account-timezone',
  subscribeQueueClear: () => () => {},
  accountTimezoneDependency: (timezoneMutationId: string) => `offline-account-timezone:${timezoneMutationId}`,
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/query-client', () => ({ queryClient: new QueryClient(), persistQueryCache: vi.fn() }))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'test-account' }))
vi.mock('@/lib/offline-state', () => ({}))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: vi.fn() }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back, canGoBack: () => true }), useLocalSearchParams: () => mocks.params }))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.translate }) }))

const droppedLog: DroppedMutation = {
  id: 'lost-log', type: 'logHabit', lastError: '500', itemName: 'Walk',
  mutation: {
    id: 'lost-log', type: 'logHabit', timestamp: 1, retries: 3, maxRetries: 3,
    endpoint: '/api/habits/walk/log', method: 'POST', payload: { date: '2026-09-05' },
    entityType: 'habit', targetEntityId: 'walk', scope: 'habits',
  },
}

describe.each(['en', 'pt-BR'])('derived offline notice in %s', (locale) => {
  let tree: RenderTree
  let unsubscribeToasts: () => void
  const toastChanges = vi.fn()
  const language = createInstance()
  beforeEach(async () => {
    vi.useFakeTimers()
    await language.init({ resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, lng: locale, interpolation: { prefix: '{', suffix: '}' } })
    mocks.translate = (key, values) => language.t(key, values)
    Object.assign(mocks.queue, { isOnline: false, pendingCount: 0, isFlushing: false, hasFailed: false })
    mocks.enqueue.mockClear()
    mocks.apiClient.mockClear()
    mocks.queued.length = 0
    mocks.push.mockClear()
    mocks.back.mockClear()
    mocks.params = {}
    useOfflineSyncStore.setState({ drops: [] })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    toastChanges.mockClear()
    unsubscribeToasts = useAppToastStore.subscribe(toastChanges)
    TestRenderer.act(() => { tree = TestRenderer.create(<OfflineNotice />) })
  })
  afterEach(() => {
    TestRenderer.act(() => tree.unmount())
    unsubscribeToasts()
    cancelScheduledFlush()
    vi.useRealTimers()
  })
  function update(patch: Partial<typeof mocks.queue>) {
    TestRenderer.act(() => {
      Object.assign(mocks.queue, patch)
      tree.update(<OfflineNotice />)
    })
    TestRenderer.act(() => vi.advanceTimersByTime(0))
  }
  function openRecoveryRoute() {
    const href = mocks.push.mock.calls.at(-1)?.[0]
    if (typeof href !== 'string') throw new Error('Expected a creation destination')
    mocks.params = Object.fromEntries(new URL(href, 'https://orbit.test').searchParams)
    TestRenderer.act(() => tree.update(<><OfflineNotice /><HabitCreateRoute /></>))
    return tree.root.findByType(CreateHabitModal).props
  }
  function toast() {
    expect(tree.root.findAllByType(Toast)).toHaveLength(1)
    return tree.root.findByType(Toast).props
  }

  it('renders one object through the success cycle, with no store pushes and no default chrome', () => {
    expect(tree.root.findAllByType(Toast)).toHaveLength(0)
    update({ pendingCount: 3 })
    expect(toast()).toMatchObject({ kind: 'neutral', message: language.t('common.queued', { count: 3 }) })
    expect(toast().icon).toBeDefined()
    expect(toast().onAction).toBeUndefined()
    update({ isOnline: true, isFlushing: true })
    expect(toast()).toMatchObject({ kind: 'working', message: language.t('common.syncing', { count: 3 }) })
    update({ isFlushing: false, hasFailed: true })
    expect(toast()).toMatchObject({ kind: 'neutral', message: language.t('common.syncRetrying') })
    expect(toast().onAction).toBeUndefined()
    update({ pendingCount: 0, hasFailed: false })
    expect(toast()).toMatchObject({ kind: 'done', message: language.t('common.synced') })
    TestRenderer.act(() => vi.advanceTimersByTime(5_000))
    expect(tree.root.findAllByType(Toast)).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(useAppToastStore.getState().queue).toEqual([])
    expect(toastChanges).not.toHaveBeenCalled()
  })

  it('keeps each dropped change until acted on and never claims a pending queue landed', () => {
    update({ pendingCount: 1 })
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop(droppedLog) })
    expect(toast()).toMatchObject({ kind: 'lost', message: language.t('common.syncDropped', { item: 'Walk' }), detail: language.t('common.syncDroppedPending') })
    TestRenderer.act(() => vi.advanceTimersByTime(4_999))
    expect(toast().kind).toBe('lost')
    update({ pendingCount: 0 })
    expect(toast().detail).toBe(language.t('common.syncDroppedDetail'))
    TestRenderer.act(() => (toast().onAction as () => void)())
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ targetEntityId: 'walk', payload: { date: '2026-09-05' }, retries: 0 }))
    expect(useOfflineSyncStore.getState().drops).toEqual([])
  })

  it('keeps dropped feedback and its explicit discard control past expiry', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop(droppedLog) })
    TestRenderer.act(() => vi.advanceTimersByTime(10_000))
    const close = tree.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === language.t('common.close'))
    expect(close).toBeDefined()
    expect(tree.root.findAllByProps({ testID: 'toast-action' }).length).toBeGreaterThan(0)
    TestRenderer.act(() => (close!.props.onPress as () => void)())
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(JSON.parse(mocks.storage.get('@orbit/offline-sync-notices')!).state.drops).toEqual([])
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it.each(['timeout', 'navigation', 'dismiss control'] as const)('keeps timezone recovery after %s and replays its dependent habit', async (transition) => {
    const timezoneMutation = buildQueuedMutation({
      type: 'setTimeZone', scope: 'profile', endpoint: '/api/profile/timezone',
      method: 'PUT', payload: { timeZone: 'America/Sao_Paulo' },
    })
    mocks.queued.push(buildQueuedMutation({
      type: 'createHabit', scope: 'habits', endpoint: '/api/habits',
      method: 'POST', payload: { title: 'Walk' }, dependsOn: [accountTimezoneDependency(timezoneMutation.id)],
    }))
    update({ pendingCount: 1, isOnline: true })
    await TestRenderer.act(async () => {
      useOfflineSyncStore.getState().addDrop({
        id: timezoneMutation.id, type: timezoneMutation.type,
        lastError: '400 validation failed', mutation: timezoneMutation,
      })
      await Promise.resolve()
    })

    function RecoveryRoot({ pathname }: Readonly<{ pathname: string }>) {
      useAppToastNavigation(pathname)
      return <OfflineNotice />
    }
    TestRenderer.act(() => tree.update(<RecoveryRoot pathname="/calendar" />))
    if (transition === 'timeout') TestRenderer.act(() => vi.advanceTimersByTime(5000))
    if (transition === 'navigation') TestRenderer.act(() => tree.update(<RecoveryRoot pathname="/profile" />))
    const controls = tree.root.findAllByType(Pressable)
    const retry = controls.find((node) => node.props.accessibilityLabel === language.t('common.syncRetryAction'))
    expect(retry).toBeDefined()
    expect(controls.filter((node) => node.props.accessibilityLabel === language.t('common.close'))).toHaveLength(0)
    await TestRenderer.act(async () => { await flushQueuedMutations() })
    expect(mocks.apiClient).not.toHaveBeenCalled()
    TestRenderer.act(() => { (retry!.props.onPress as () => void)() })
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: 'setTimeZone', id: timezoneMutation.id }))
    await TestRenderer.act(async () => { await flushQueuedMutations() })
    expect(mocks.apiClient.mock.calls.map((call) => call[0])).toEqual(['/api/profile/timezone', '/api/habits'])
    expect(mocks.queued).toEqual([])
    expect(useOfflineSyncStore.getState().drops).toEqual([])
  })

  it.each(['timeout', 'navigation'] as const)('dismisses Undo on %s while preserving dropped feedback', (transition) => {
    function RecoveryRoot({ pathname }: Readonly<{ pathname: string }>) {
      useAppToastNavigation(pathname)
      return <OfflineNotice />
    }
    TestRenderer.act(() => {
      tree.update(<RecoveryRoot pathname="/calendar" />)
      useOfflineSyncStore.getState().addDrop(droppedLog)
      useAppToastStore.getState().showQueued('Deleted habit', 'Undo', vi.fn())
    })
    expect(tree.root.findAllByType(Pressable).some((node) => node.props.accessibilityLabel === 'Undo')).toBe(true)
    if (transition === 'timeout') TestRenderer.act(() => vi.advanceTimersByTime(5000))
    else TestRenderer.act(() => tree.update(<RecoveryRoot pathname="/profile" />))
    expect(tree.root.findAllByType(Pressable).some((node) => node.props.accessibilityLabel === 'Undo')).toBe(false)
    expect(tree.root.findAllByProps({ testID: 'toast-action' }).length).toBeGreaterThan(0)
    expect(useAppToastStore.getState().currentToast).toBeNull()
    expect(useOfflineSyncStore.getState().drops).toEqual([droppedLog])
  })

  it('keeps Undo operable alongside pending queue status and removes the empty host', () => {
    const undo = vi.fn()
    update({ pendingCount: 1 })
    TestRenderer.act(() => useAppToastStore.getState().showQueued('Deleted habit', 'Undo', undo))
    const control = tree.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === 'Undo')
    expect(control).toBeDefined()
    TestRenderer.act(() => (control!.props.onPress as () => void)())
    expect(undo).toHaveBeenCalledOnce()
    expect(toast().message).toBe(language.t('common.queued', { count: 1 }))
    update({ pendingCount: 0 })
    TestRenderer.act(() => vi.advanceTimersByTime(5_000))
    expect(tree.root.findAllByType(Toast)).toHaveLength(0)
    expect(tree.root.findAllByType('View')).toHaveLength(0)
  })

  it('keeps the notice on recovery navigation while retaining the destination context', () => {
    function RecoveryRoot({ pathname }: Readonly<{ pathname: string }>) {
      useAppToastNavigation(pathname)
      return <><OfflineNotice />{pathname === '/habits/new' ? <HabitCreateRoute /> : null}</>
    }
    const orphan = { ...droppedLog, id: 'orphan-navigation', mutation: { ...droppedLog.mutation, targetEntityId: 'offline-habit-orphan' } }
    TestRenderer.act(() => {
      useOfflineSyncStore.getState().addDrop(orphan)
      tree.update(<RecoveryRoot pathname="/" />)
    })
    TestRenderer.act(() => (toast().onAction as () => void)())
    const href = mocks.push.mock.calls.at(-1)?.[0]
    if (typeof href !== 'string') throw new Error('Expected a recovery destination')
    mocks.params = Object.fromEntries(new URL(href, 'https://orbit.test').searchParams)
    TestRenderer.act(() => tree.update(<RecoveryRoot pathname="/habits/new" />))
    expect(tree.root.findAllByProps({ testID: 'toast-lost' }).length).toBeGreaterThan(0)
    expect(useOfflineSyncStore.getState().drops.map((drop) => drop.id)).toContain('orphan-navigation')
    expect(tree.root.findByType(CreateHabitModal).props.recoveryMessage).toBe(language.t('common.syncOrphaned', { date: '2026-09-05' }))
  })

  it('retains orphan recovery when creation closes without success', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({ ...droppedLog, mutation: { ...droppedLog.mutation, targetEntityId: 'offline-habit-orphan' } }) })
    TestRenderer.act(() => (toast().onAction as () => void)())
    const form = openRecoveryRoute()
    TestRenderer.act(() => (form.onClose as () => void)())
    expect(useOfflineSyncStore.getState().drops).toHaveLength(1)
    expect(JSON.parse(mocks.storage.get('@orbit/offline-sync-notices')!).state.drops).toHaveLength(1)
    expect(toast().kind).toBe('lost')
    expect(mocks.back).toHaveBeenCalledOnce()
  })

  it('removes orphan recovery only on the creation completion signal', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({ ...droppedLog, mutation: { ...droppedLog.mutation, targetEntityId: 'offline-habit-orphan' } }) })
    TestRenderer.act(() => (toast().onAction as () => void)())
    const modal = openRecoveryRoute()
    expect(modal.onCreated).toBeTypeOf('function')
    TestRenderer.act(() => (modal.onCreated as () => void)())
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(tree.root.findAllByType(Toast)).toHaveLength(0)
    expect(JSON.parse(mocks.storage.get('@orbit/offline-sync-notices')!).state.drops).toEqual([])
  })

  it('removes cleared recovery notices and refuses their retained actions', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop(droppedLog) })
    const recover = toast().onAction as () => void
    TestRenderer.act(() => { useOfflineSyncStore.setState({ drops: [] }) })
    expect(tree.root.findAllByType(Toast)).toHaveLength(0)
    TestRenderer.act(() => recover())
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('opens creation for an orphaned log, carries its date, and never requeues its temporary identifier', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({ ...droppedLog, mutation: { ...droppedLog.mutation, targetEntityId: 'offline-habit-orphan' } }) })
    expect(toast().message).toBe(language.t('common.syncOrphaned', { date: '2026-09-05' }))
    expect(toast().actionLabel).toBe(language.t('habits.createHabit'))
    TestRenderer.act(() => (toast().onAction as () => void)())
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(openRecoveryRoute()).toMatchObject({ open: true, presentation: 'screen', initialDate: '2026-09-05', recoveryMessage: language.t('common.syncOrphaned', { date: '2026-09-05' }) })
  })
  it('does not announce synced when only the retry state was visible', () => {
    update({ pendingCount: 1, isOnline: true, hasFailed: true })
    expect(toast().message).toBe(language.t('common.syncRetrying'))
    update({ pendingCount: 0, hasFailed: false })
    expect(tree.root.findAllByType(Toast)).toHaveLength(0)
  })

  it('names a failed habit creation without inventing a lost log', () => {
    TestRenderer.act(() => {
      useOfflineSyncStore.getState().addDrop({
        id: 'create-lost', type: 'createHabit', lastError: '400',
        mutation: { ...droppedLog.mutation, id: 'create-lost', type: 'createHabit', targetEntityId: null, payload: { title: 'Read' } },
      })
    })
    expect(toast().message).toBe(language.t('common.syncHabitNotCreated', { item: 'Read' }))
    expect(toast().actionLabel).toBe(language.t('habits.createHabit'))
  })

  it.each([
    ['restoreGoal', 'goals'], ['restoreTag', 'tags'], ['setName', 'profile'],
    ['dismissCalendarPrompt', 'profile'],
  ] as const)('preserves the persisted scope of %s when displaying and retrying', (type, scope) => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({
      ...droppedLog, type, itemName: undefined,
      mutation: { ...droppedLog.mutation, type, scope, payload: null },
    }) })
    expect(toast().message).toBe(language.t('common.syncChangeDropped', { item: language.t(`common.syncEntity.${scope}`) }))
    TestRenderer.act(() => (toast().onAction as () => void)())
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type, scope }))
  })

  it('uses the persisted scope when a recovery needs navigation', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({
      ...droppedLog, type: 'restoreGoal', itemName: undefined,
      mutation: { ...droppedLog.mutation, type: 'restoreGoal', scope: 'profile', dependsOn: ['offline-goal-missing'] },
    }) })
    TestRenderer.act(() => (toast().onAction as () => void)())
    expect(mocks.push).toHaveBeenLastCalledWith('/profile')
  })

  it.each(['offline-work', 'offline-habit-123-1'])('retries a tag named %s without losing its payload', (name) => {
    const payload = { name, color: '#123456' }
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({
      ...droppedLog, type: 'updateTag', itemName: undefined,
      mutation: { ...droppedLog.mutation, type: 'updateTag', scope: 'tags', endpoint: '/api/tags/work', payload },
    }) })
    expect(toast().actionLabel).toBe(language.t('common.syncRetryAction'))
    TestRenderer.act(() => (toast().onAction as () => void)())
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ payload, scope: 'tags' }))
    expect(useOfflineSyncStore.getState().drops).toHaveLength(0)
  })

})

describe('offline notice in the shell notice slot', () => {
  it('leaves the horizontal inset to the shell slot', async () => {
    Object.assign(mocks.queue, { isOnline: false, pendingCount: 2, isFlushing: false, hasFailed: false })
    useOfflineSyncStore.setState({ drops: [] })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    let shell!: { root: { findAll: (match: (node: { type: unknown; props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] }; unmount: () => void }
    await TestRenderer.act(() => {
      shell = TestRenderer.create(<Shell412 notice={<OfflineNotice />} tabBar={React.createElement('TabBar')} />)
    })
    const styleOf = (testID: string) => {
      const [node] = shell.root.findAll((candidate) => typeof candidate.type === 'string' && candidate.props.testID === testID)
      return StyleSheet.flatten(node!.props.style) as Record<string, number | undefined>
    }
    const inset = (style: Record<string, number | undefined>, side: 'Left' | 'Right') =>
      style[`padding${side}`] ?? style.paddingHorizontal ?? style.padding ?? 0
    const slot = styleOf('shell-notice')
    const host = styleOf('offline-notice')
    expect(inset(slot, 'Left') + inset(host, 'Left')).toBe(16)
    expect(inset(slot, 'Right') + inset(host, 'Right')).toBe(16)
    expect(host).toMatchObject({ paddingVertical: 16, gap: 12 })
    await TestRenderer.act(() => shell.unmount())
  })
})

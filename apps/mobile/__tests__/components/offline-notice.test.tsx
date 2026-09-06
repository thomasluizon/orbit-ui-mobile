import React from 'react'
import { Pressable } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { OfflineNotice } from '@/components/offline-notice'
import { Toast } from '@/components/ui/app-toast'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import type { DroppedMutation } from '@/lib/offline-mutations'

const TestRenderer = require('react-test-renderer')
interface RenderTree {
  update: (element: React.ReactNode) => void
  unmount: () => void
  root: {
    findByType: (type: unknown) => { props: Record<string, unknown> }
    findAllByType: (type: unknown) => { props: Record<string, unknown> }[]
  }
}
const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  queue: { isOnline: false, pendingCount: 0, isFlushing: false, hasFailed: false },
  enqueue: vi.fn(),
  push: vi.fn(),
  translate: (key: string, values?: Record<string, unknown>) => key + JSON.stringify(values),
}))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: (key: string) => Promise.resolve(mocks.storage.get(key) ?? null),
  setItem: (key: string, value: string) => { mocks.storage.set(key, value); return Promise.resolve() },
  removeItem: (key: string) => { mocks.storage.delete(key); return Promise.resolve() },
} }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => mocks.queue }))
vi.mock('@/lib/offline-queue', () => ({ enqueue: mocks.enqueue }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/query-client', () => ({ queryClient: {}, persistQueryCache: vi.fn() }))
vi.mock('@/lib/offline-state', () => ({}))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: vi.fn() }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
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
    mocks.push.mockClear()
    useOfflineSyncStore.setState({ drops: [], isFlushing: false })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    toastChanges.mockClear()
    unsubscribeToasts = useAppToastStore.subscribe(toastChanges)
    TestRenderer.act(() => { tree = TestRenderer.create(<OfflineNotice />) })
  })
  afterEach(() => {
    TestRenderer.act(() => tree.unmount())
    unsubscribeToasts()
    vi.useRealTimers()
  })
  function update(patch: Partial<typeof mocks.queue>) {
    TestRenderer.act(() => {
      Object.assign(mocks.queue, patch)
      tree.update(<OfflineNotice />)
    })
    TestRenderer.act(() => vi.advanceTimersByTime(0))
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
    TestRenderer.act(() => vi.advanceTimersByTime(60_000))
    expect(toast().kind).toBe('lost')
    update({ pendingCount: 0 })
    expect(toast().detail).toBe(language.t('common.syncDroppedDetail'))
    TestRenderer.act(() => (toast().onAction as () => void)())
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ targetEntityId: 'walk', payload: { date: '2026-09-05' }, retries: 0 }))
    expect(useOfflineSyncStore.getState().drops).toEqual([])
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

  it('retains orphan recovery when creation closes without success', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({ ...droppedLog, mutation: { ...droppedLog.mutation, targetEntityId: 'offline-habit-orphan' } }) })
    TestRenderer.act(() => (toast().onAction as () => void)())
    TestRenderer.act(() => (tree.root.findByType(CreateHabitModal).props.onClose as () => void)())
    expect(useOfflineSyncStore.getState().drops).toHaveLength(1)
    expect(JSON.parse(mocks.storage.get('@orbit/offline-sync-notices')!).state.drops).toHaveLength(1)
    expect(toast().kind).toBe('lost')
    expect(tree.root.findByType(CreateHabitModal).props.open).toBe(false)
  })

  it('removes orphan recovery only on the creation completion signal', () => {
    TestRenderer.act(() => { useOfflineSyncStore.getState().addDrop({ ...droppedLog, mutation: { ...droppedLog.mutation, targetEntityId: 'offline-habit-orphan' } }) })
    TestRenderer.act(() => (toast().onAction as () => void)())
    const modal = tree.root.findByType(CreateHabitModal).props
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
    expect(tree.root.findByType(CreateHabitModal).props).toMatchObject({ open: true, initialDate: '2026-09-05', recoveryMessage: language.t('common.syncOrphaned', { date: '2026-09-05' }) })
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
    expect(mocks.push).toHaveBeenLastCalledWith('/preferences')
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

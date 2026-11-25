import { destructiveFailureCases, destructiveActionMessage } from '@orbit/shared/test-support/destructive-action-fixtures'
import React from 'react'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FreshStartModal } from '@/app/(tabs)/profile/_components/fresh-start-modal'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import { useAuthStore } from '@/stores/auth-store'
import { advanceAccountGeneration, getAccountGeneration } from '@/lib/session-epoch'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import type { DroppedMutation } from '@/lib/offline-mutations'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const replace = vi.fn()
const resetAccountQueries = vi.hoisted(() => vi.fn(async (_client: QueryClient, _mode: 'signed-in' | 'signed-out') => {}))
const activeQueryClient = vi.hoisted(() => ({ current: null as QueryClient | null }))
const storage = vi.hoisted(() => new Map<string, string>())

const failureCopy = vi.hoisted(() => ({ actual: false, locale: 'en' }))

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => failureCopy.actual ? destructiveActionMessage(failureCopy.locale, key) : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQueryClient: () => activeQueryClient.current ?? {},
}))

vi.mock('@orbit/shared/query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/query')>(),
  resetAccountQueries,
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); return Promise.resolve() }),
    removeItem: vi.fn((key: string) => { storage.delete(key); return Promise.resolve() }),
    multiRemove: vi.fn((keys: readonly string[]) => { for (const key of keys) storage.delete(key); return Promise.resolve() }),
  },
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(async () => { await Promise.resolve(); return ({}); }),
}))

vi.mock('@/lib/checklist-template-storage', () => ({
  clearChecklistTemplates: vi.fn(async () => { await Promise.resolve(); return undefined; }),
}))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn((mutation: Record<string, unknown>) => ({ id: 'reset-1', ...mutation })),
  createQueuedAck: vi.fn((id: string) => ({ queued: true, queuedMutationId: id })),
  isQueuedResult: vi.fn((result: { queued?: boolean }) => result.queued === true),
  queueOrExecute: vi.fn(
    async ({ execute, mutation }: { execute: (mutation: unknown) => Promise<unknown>; mutation: unknown }) =>
      { await Promise.resolve(); return execute(mutation); },
  ),
}))

vi.mock('@/lib/offline-queue', () => ({
  clear: vi.fn(),
  enqueue: vi.fn(),
}))

vi.mock('@/lib/query-client', () => ({
  clearPersistedQueryCache: vi.fn(async () => { await Promise.resolve(); return undefined; }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/ui/app-text-input', () => ({
  AppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void | Promise<void>): Promise<void>
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

async function render(element: React.ReactNode): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => {
await Promise.resolve()
    tree = TestRenderer.create(element)
  })
  return tree
}

const textOf = (node: unknown): string => typeof node === 'string' ? node : ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')

function buttonWithLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || textOf(node) === label),
  )[0]
}

function input(tree: TestTree): TestNode {
  return tree.root.findAll((node) => node.type === 'TextInput')[0]!
}

async function press(node: TestNode) {
  await TestRenderer.act(async () => {
    ;(node.props as { onPress: () => void }).onPress()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function confirmReset(tree: TestTree) {
  await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
  await TestRenderer.act(async () => {
await Promise.resolve()
    ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('orbit')
  })
  await press(buttonWithLabel(tree, 'profile.freshStart.deleteData')!)
}

describe('FreshStartModal', () => {
  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'
    activeQueryClient.current = null
    storage.clear()
    useOfflineSyncStore.setState({ drops: [] })
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' },
    })
    replace.mockClear()
    resetAccountQueries.mockClear()
  })
  afterEach(() => {
    activeQueryClient.current = null
    sheetTestControls.defer(false)
    vi.clearAllMocks()
  })

  it.each(['button', 'keyboard'])('resets once when confirmed twice by %s', async method => {
    const offlineMutations = await import('@/lib/offline-mutations')
    let reject!: (error: Error) => void
    vi.mocked(offlineMutations.queueOrExecute).mockReturnValueOnce(new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    await TestRenderer.act(() => { (input(tree).props.onChangeText as (value: string) => void)('ORBIT') })
    await TestRenderer.act(async () => {
      const send = buttonWithLabel(tree, 'profile.freshStart.deleteData')!.props.onPress as () => void
      send()
      if (method === 'keyboard') (input(tree).props.onSubmitEditing as () => void)()
      else send()
      await Promise.resolve()
    })
    expect(offlineMutations.queueOrExecute).toHaveBeenCalledOnce()
    await TestRenderer.act(() => reject(new Error('Failed')))
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-1' } })
  })

  it('does not reset without an account or submit an incomplete confirmation', async () => {
    const offlineMutations = await import('@/lib/offline-mutations')
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    await TestRenderer.act(() => { (input(tree).props.onChangeText as (value: string) => void)('ORB') })
    await TestRenderer.act(() => { (input(tree).props.onSubmitEditing as () => void)() })
    expect(offlineMutations.queueOrExecute).not.toHaveBeenCalled()
    useAuthStore.setState({ user: null })
    await TestRenderer.act(() => { (input(tree).props.onChangeText as (value: string) => void)('ORBIT') })
    await press(buttonWithLabel(tree, 'profile.freshStart.deleteData')!)
    expect(offlineMutations.queueOrExecute).not.toHaveBeenCalled()
  })

  it('shows nothing and clears nothing when a reset fails after the account changes', async () => {
    const offlineMutations = await import('@/lib/offline-mutations')
    const offlineQueue = await import('@/lib/offline-queue')
    const { clearChecklistTemplates } = await import('@/lib/checklist-template-storage')
    let reject!: (error: Error) => void
    vi.mocked(offlineMutations.queueOrExecute).mockReturnValueOnce(new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await confirmReset(tree)
    await TestRenderer.act(async () => {
      advanceAccountGeneration()
      useAuthStore.setState({ user: { userId: 'user-2', name: 'Next', email: 'next@example.com' } })
      reject(new Error('Old failure'))
      await Promise.resolve()
    })
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'alert')).toHaveLength(0)
    expect(offlineQueue.clear).not.toHaveBeenCalled()
    expect(clearChecklistTemplates).not.toHaveBeenCalled()
    expect(resetAccountQueries).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(buttonWithLabel(tree, 'profile.freshStart.deleteData')!.props.accessibilityState).not.toMatchObject({ busy: true })
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-2' } })
  })

  it.each(destructiveFailureCases.flatMap(scenario => ['en', 'pt-BR'].map(locale => ({ ...scenario, locale }))))('shows $kind failure copy in $locale and keeps the session', async ({ createError, key, locale }) => {
    failureCopy.actual = true; failureCopy.locale = locale
    const offlineMutations = await import('@/lib/offline-mutations')
    const offlineQueue = await import('@/lib/offline-queue')
    const { clearChecklistTemplates } = await import('@/lib/checklist-template-storage')
    vi.mocked(offlineMutations.queueOrExecute).mockRejectedValueOnce(createError())
    const onClose = vi.fn()
    const tree = await render(<FreshStartModal open onClose={onClose} />)
    await press(buttonWithLabel(tree, destructiveActionMessage(locale, 'profile.freshStart.reviewDeletion'))!)
    await TestRenderer.act(() => { (input(tree).props.onChangeText as (value: string) => void)('ORBIT') })
    const label = destructiveActionMessage(locale, 'profile.freshStart.deleteData')
    await press(buttonWithLabel(tree, label)!)
    const errors = tree.root.findAll(node => node.type === 'Text').map(node => node.props.children)
    expect(errors).toContain(destructiveActionMessage(locale, key ?? 'profile.freshStart.errorGeneric'))
    expect(buttonWithLabel(tree, label)!.props.accessibilityState).not.toMatchObject({ busy: true })
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-1' } })
    expect(offlineQueue.clear).not.toHaveBeenCalled()
    expect(clearChecklistTemplates).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus to the confirm field, never leaving it on the disabled Delete data', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    expect(input(tree).props.autoFocus).toBe(true)
  })

  it('closes from the first question and goes back from the confirmation without resetting data', async () => {
    const onClose = vi.fn()
    const tree = await render(<FreshStartModal open onClose={onClose} />)
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    await press(buttonWithLabel(tree, 'common.back')!)
    expect(onClose).not.toHaveBeenCalled()
    expect(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')).toBeDefined()
    await press(buttonWithLabel(tree, 'common.close')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(resetAccountQueries).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('resets the account online, clears caches and opens Today from the result dialog', async () => {
    const onClose = vi.fn()
    const { apiClient } = await import('@/lib/api-client')
    const offlineMutations = await import('@/lib/offline-mutations')
    const offlineQueue = await import('@/lib/offline-queue')
    const tree = await render(<FreshStartModal open onClose={onClose} />)
    await confirmReset(tree)

    expect(vi.mocked(apiClient)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(offlineMutations.queueOrExecute)).toHaveBeenCalledWith(
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    )
    expect(vi.mocked(apiClient)).toHaveBeenCalledWith(
      API.profile.reset,
      { method: 'POST', isCurrent: expect.any(Function) },
    )
    expect(vi.mocked(offlineQueue.clear)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(offlineQueue.enqueue)).not.toHaveBeenCalled()
    expect(resetAccountQueries).toHaveBeenCalled()
    expect((await import('@/lib/checklist-template-storage')).clearChecklistTemplates).toHaveBeenCalledTimes(1)
    expect((await import('@/lib/query-client')).clearPersistedQueryCache).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()

    await press(buttonWithLabel(tree, 'result.account.openToday')!)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/(tabs)')
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('settles a mounted query whose fetch was held across Fresh Start', async () => {
    sheetTestControls.defer(true)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    activeQueryClient.current = client
    const actual = await vi.importActual<typeof import('@orbit/shared/query')>('@orbit/shared/query')
    resetAccountQueries.mockImplementationOnce((queryClient, mode) => actual.resetAccountQueries(queryClient, mode))
    let fetches = 0
    const observer = new QueryObserver(client, {
      queryKey: ['profile', 'detail'],
      queryFn: () => {
        fetches += 1
        return fetches === 1 ? new Promise<string>(() => undefined) : Promise.resolve('after-reset')
      },
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().fetchStatus).toBe('fetching'))
      const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
      await confirmReset(tree)

      await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({
        status: 'success', fetchStatus: 'idle', data: 'after-reset',
      }))
      expect(fetches).toBe(2)
      expect(resetAccountQueries).toHaveBeenCalledWith(client, 'signed-in')
    } finally {
      unsubscribe()
      client.clear()
      activeQueryClient.current = null
    }
  })

  it('lets the trial notice appear again, whichever key suppressed it', async () => {
    const legacyKey = 'orbit_trial_expired_seen'
    const scopedKey = buildAccountScopedStorageKey(legacyKey, 'user-1')
    useAuthStore.setState({ user: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' } })
    storage.set(legacyKey, '1')
    storage.set(scopedKey, '1')

    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await confirmReset(tree)

    expect(storage.has(legacyKey)).toBe(false)
    expect(storage.has(scopedKey)).toBe(false)
  })

  it('keeps the next account trial notice after an old reset settles', async () => {
    const offlineMutations = await import('@/lib/offline-mutations')
    let finishReset!: (value: { queued: false; queuedMutationId: string }) => void
    vi.mocked(offlineMutations.queueOrExecute).mockImplementationOnce(() =>
      new Promise((resolve) => { finishReset = resolve }),
    )
    useAuthStore.setState({ user: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' } })
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await confirmReset(tree)
    const nextAccountKey = buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-2')
    storage.set(nextAccountKey, '1')

    await TestRenderer.act(async () => {
      advanceAccountGeneration()
      useAuthStore.setState({ user: { userId: 'user-2', name: 'Bea', email: 'bea@example.com' } })
      finishReset({ queued: false, queuedMutationId: 'reset-1' })
      await Promise.resolve()
    })

    expect(storage.get(nextAccountKey)).toBe('1')
    expect(resetAccountQueries).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('leaves the next account untouched when it changes during reset cleanup', async () => {
    let finishCleanup!: () => void
    const clearDrops = useOfflineSyncStore.getState().clearDrops
    useOfflineSyncStore.setState({
      clearDrops: vi.fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => { finishCleanup = resolve }))
        .mockImplementation(() => clearDrops()),
    })
    try {
      useAuthStore.setState({ user: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' } })
      const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
      await confirmReset(tree)
      const nextAccountKey = buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-2')
      storage.set(nextAccountKey, '1')
      const startingGeneration = getAccountGeneration()

      await TestRenderer.act(async () => {
        useAuthStore.setState({
          sessionPhase: 'establishing',
          isAuthenticated: false,
          user: { userId: 'user-2', name: 'Bea', email: 'bea@example.com' },
        })
        finishCleanup()
        await Promise.resolve()
      })

      expect(getAccountGeneration()).toBe(startingGeneration)
      expect(storage.get(nextAccountKey)).toBe('1')
      expect(resetAccountQueries).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
      const offlineMutations = await import('@/lib/offline-mutations')
      const request = vi.mocked(offlineMutations.queueOrExecute).mock.calls[0]![0]
      expect(request.isCurrent?.()).toBe(false)
    } finally {
      useOfflineSyncStore.setState({ clearDrops })
    }
  })

  it('enqueues the reset when it is queued offline', async () => {
    const offlineMutations = await import('@/lib/offline-mutations')
    const offlineQueue = await import('@/lib/offline-queue')
    vi.mocked(offlineMutations.queueOrExecute).mockResolvedValueOnce({
      queued: true,
      queuedMutationId: 'reset-1',
    })
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await confirmReset(tree)
    expect(vi.mocked(offlineQueue.enqueue)).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('clears persisted recovery actions after Fresh Start (queued: %s)', async (queued) => {
    const offlineMutations = await import('@/lib/offline-mutations')
    const offlineQueue = await import('@/lib/offline-queue')
    const drops: DroppedMutation[] = (['createHabit', 'updateHabit'] as const).map((type) => ({
      id: type, type, lastError: '400',
      mutation: { id: type, type, timestamp: 1, retries: 3, maxRetries: 3, endpoint: '/api/habits', method: 'POST', payload: { title: 'Old habit' } },
    }))
    for (const drop of drops) useOfflineSyncStore.getState().addDrop(drop)
    expect(storage.get('@orbit/offline-sync-notices')).toContain('Old habit')
    if (queued) vi.mocked(offlineMutations.queueOrExecute).mockResolvedValueOnce({ queued: true, queuedMutationId: 'reset-1' })
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await confirmReset(tree)
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(storage.get('@orbit/offline-sync-notices')).not.toContain('Old habit')
    await useOfflineSyncStore.persist.rehydrate()
    expect(useOfflineSyncStore.getState().drops).toEqual([])
    expect(offlineQueue.clear).toHaveBeenCalledTimes(1)
    expect(offlineQueue.enqueue).toHaveBeenCalledTimes(queued ? 1 : 0)
    if (queued) expect(offlineQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: 'reset-1', type: 'resetProfile' }))
  })

  it('surfaces a friendly error and keeps the modal open on failure', async () => {
    const onClose = vi.fn()
    const offlineMutations = await import('@/lib/offline-mutations')
    vi.mocked(offlineMutations.queueOrExecute).mockRejectedValueOnce(new Error('offline'))
    const tree = await render(<FreshStartModal open onClose={onClose} />)
    await confirmReset(tree)
    expect(onClose).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    const errorText = tree.root
      .findAll((node) => node.type === 'Text')
      .map((node) => node.props.children)
      .find((value) => typeof value === 'string' && value.toLowerCase().includes('error'))
    expect(errorText).toBeTruthy()
    expect(useAuthStore.getState()).toMatchObject({ sessionPhase: 'signed-in', user: { userId: 'user-1' } })
  })
})

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
import { sheetSlotButtons } from '@/__tests__/support/sheet-slots'


vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const replace = vi.fn()
const resetAccountQueries = vi.hoisted(() => vi.fn(async (_client: QueryClient, _mode: 'signed-in' | 'signed-out') => {}))
const activeQueryClient = vi.hoisted(() => ({ current: null as QueryClient | null }))
const storage = vi.hoisted(() => new Map<string, string>())

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
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

function buttonWithLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label,
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

  it('renders the info step heading when opened', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    const modal = tree.root.findAll((node) => node.type === 'Sheet')[0]!
    expect(modal.props.title).toBe('profile.freshStart.heading')
  })

  it('advances from info to the confirm step', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    expect(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!.props.testID).toBe('button-caution-md')
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    const modal = tree.root.findAll((node) => node.type === 'Sheet')[0]!
    expect(modal.props.title).toBe('profile.freshStart.confirmHeading')
  })

  it('moves focus to the confirm field, never leaving it on the disabled Delete data', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    expect(input(tree).props.autoFocus).toBe(true)
  })

  it('pins both steps\' actions in the sheet footer, never in the scrolling body', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'profile.freshStart.reviewDeletion'])
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual([])
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'profile.freshStart.deleteData'])
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual([])
  })

  it('names the deletion review and lets both actions hug their labels in each step', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    const width = (label: string) => {
      const node = label === 'common.cancel'
        ? tree.root.findAll((candidate) => candidate.props.testID === 'button-ghost-md')[0]!
        : buttonWithLabel(tree, label)!
      const style = node.props.style as (state: { pressed: boolean }) => (Record<string, unknown> | null)[]
      return Object.assign({}, ...style({ pressed: false }).filter(Boolean)).width
    }
    expect(width('profile.freshStart.reviewDeletion')).toBeUndefined()
    expect(width('common.cancel')).toBeUndefined()
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    expect(width('profile.freshStart.deleteData')).toBeUndefined()
    expect(width('common.cancel')).toBeUndefined()
  })

  it.each(['choose', 'confirm'] as const)('cancels from the %s step without resetting data', async (step) => {
    const onClose = vi.fn()
    const tree = await render(<FreshStartModal open onClose={onClose} />)
    if (step === 'confirm') await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    await press(tree.root.findAll((node) => node.props.testID === 'button-ghost-md')[0]!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(resetAccountQueries).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('keeps the confirm button disabled until ORBIT is typed', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'profile.freshStart.reviewDeletion')!)
    expect(buttonWithLabel(tree, 'profile.freshStart.deleteData')!.props.testID).toBe('button-caution-md')
    expect(buttonWithLabel(tree, 'profile.freshStart.deleteData')!.props.disabled).toBe(true)
    await TestRenderer.act(async () => {
await Promise.resolve()
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('orbit')
    })
    expect(buttonWithLabel(tree, 'profile.freshStart.deleteData')!.props.disabled).toBe(false)
  })

  it('resets the account online, clears caches and navigates after sheet dismissal', async () => {
    const onClose = vi.fn()
    sheetTestControls.defer(true)
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
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()

    await TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/')
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

  it('shows a failed reset in the pinned footer, beside Delete data', async () => {
    const offlineMutations = await import('@/lib/offline-mutations')
    vi.mocked(offlineMutations.queueOrExecute).mockRejectedValueOnce(new Error('offline'))
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await confirmReset(tree)
    const alerts = (slot: string) => tree.root
      .findAll((node) => node.type === slot)[0]!
      .findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert')

    expect(alerts('SheetActions')).toHaveLength(1)
    expect(alerts('SheetBody')).toHaveLength(0)
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
  })
})

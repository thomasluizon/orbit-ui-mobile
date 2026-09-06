import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FreshStartModal } from '@/app/(tabs)/profile/_components/fresh-start-modal'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import type { DroppedMutation } from '@/lib/offline-mutations'

const replace = vi.fn()
const queryClientClear = vi.fn()
const storage = vi.hoisted(() => new Map<string, string>())

vi.mock('@/components/ui/icons', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props)
  return { Check: icon('Check'), RotateCcw: icon('RotateCcw'), X: icon('X') }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: queryClientClear }),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); return Promise.resolve() }),
    removeItem: vi.fn((key: string) => { storage.delete(key); return Promise.resolve() }),
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

vi.mock('@/components/ui/fresh-start-animation', () => ({
  FreshStartAnimation: (props: Record<string, unknown>) => React.createElement('FreshStartAnimation', props),
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
  await press(buttonWithLabel(tree, 'common.continue')!)
  await TestRenderer.act(async () => {
await Promise.resolve()
    ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('orbit')
  })
  await press(buttonWithLabel(tree, 'profile.freshStart.confirmButton')!)
}

describe('FreshStartModal', () => {
  beforeEach(() => {
    storage.clear()
    useOfflineSyncStore.setState({ drops: [] })
    replace.mockClear()
    queryClientClear.mockClear()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the info step heading when opened', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    const modal = tree.root.findAll((node) => node.type === 'Sheet')[0]!
    expect(modal.props.title).toBe('profile.freshStart.heading')
  })

  it('advances from info to the confirm step', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'common.continue')!)
    const modal = tree.root.findAll((node) => node.type === 'Sheet')[0]!
    expect(modal.props.title).toBe('profile.freshStart.confirmHeading')
  })

  it('keeps the confirm button disabled until ORBIT is typed', async () => {
    const tree = await render(<FreshStartModal open onClose={vi.fn()} />)
    await press(buttonWithLabel(tree, 'common.continue')!)
    expect(buttonWithLabel(tree, 'profile.freshStart.confirmButton')!.props.disabled).toBe(true)
    await TestRenderer.act(async () => {
await Promise.resolve()
      ;(input(tree).props as { onChangeText: (value: string) => void }).onChangeText('orbit')
    })
    expect(buttonWithLabel(tree, 'profile.freshStart.confirmButton')!.props.disabled).toBe(false)
  })

  it('resets the account online, clears caches and plays the animation', async () => {
    const onClose = vi.fn()
    const { apiClient } = await import('@/lib/api-client')
    const offlineQueue = await import('@/lib/offline-queue')
    const tree = await render(<FreshStartModal open onClose={onClose} />)
    await confirmReset(tree)

    expect(vi.mocked(apiClient)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(offlineQueue.clear)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(offlineQueue.enqueue)).not.toHaveBeenCalled()
    expect(queryClientClear).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)

    const animation = tree.root.findAll((node) => node.type === 'FreshStartAnimation')[0]!
    expect(animation).toBeTruthy()
    await TestRenderer.act(async () => {
await Promise.resolve()
      ;(animation.props as { onComplete: () => void }).onComplete()
    })
    expect(replace).toHaveBeenCalledWith('/')
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
    expect(tree.root.findAll((node) => node.type === 'FreshStartAnimation')).toHaveLength(0)
    const errorText = tree.root
      .findAll((node) => node.type === 'Text')
      .map((node) => node.props.children)
      .find((value) => typeof value === 'string' && value.toLowerCase().includes('error'))
    expect(errorText).toBeTruthy()
  })
})

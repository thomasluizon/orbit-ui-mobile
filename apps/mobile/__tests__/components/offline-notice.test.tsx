import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DroppedMutation } from '@/lib/offline-mutations'
import { OfflineNotice } from '@/components/offline-notice'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  offline: {
    isOnline: false,
    pendingCount: 0,
    isFlushing: false,
    hasFailed: false,
  },
  store: {
    drops: [] as DroppedMutation[],
    dismissDrop: vi.fn(),
  },
  enqueue: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => mocks.offline,
}))

vi.mock('@/stores/offline-sync-store', () => {
  const useOfflineSyncStore = Object.assign(
    (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
    { getState: () => mocks.store },
  )
  return { useOfflineSyncStore }
})

vi.mock('@/lib/offline-queue', () => ({ enqueue: mocks.enqueue }))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: (queuedMutation: Record<string, unknown>) => ({
    id: 'recovery-retry',
    timestamp: 1,
    retries: 0,
    maxRetries: 5,
    ...queuedMutation,
  }),
  getMutationScope: (type: string) => type.includes('Habit') || type === 'bulkLogHabits'
    ? 'habits'
    : 'profile',
  isAutomaticReplayBlocked: (type: string) => type === 'bulkLogHabits',
  hasPendingOfflineDependencies: (queuedMutation: DroppedMutation['mutation']) =>
    Boolean(queuedMutation.targetEntityId?.startsWith('offline-')) ||
    queuedMutation.endpoint.includes('offline-'),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: (props: Record<string, unknown>) =>
    React.createElement('CreateHabitModal', props),
}))

function mutation(
  patch: Partial<DroppedMutation['mutation']> = {},
): DroppedMutation['mutation'] {
  return {
    id: 'mutation-1',
    timestamp: 1,
    type: 'updateHabit',
    endpoint: '/api/habits/habit-1',
    method: 'PUT',
    payload: { title: 'Read' },
    retries: 5,
    maxRetries: 5,
    scope: 'habits',
    ...patch,
  }
}

function drop(patch: Partial<DroppedMutation['mutation']> = {}): DroppedMutation {
  const queuedMutation = mutation(patch)
  return {
    id: queuedMutation.id,
    type: queuedMutation.type,
    lastError: 'validation failed',
    mutation: queuedMutation,
    itemName: 'Read',
  }
}

function text(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node === 'object' && 'children' in node) {
    return text((node).children)
  }
  return ''
}

function render() {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<OfflineNotice />)
  })
  return tree
}

function action(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAll(
    (node: { props: { onPress?: () => void }; children: unknown[] }) =>
      typeof node.props.onPress === 'function' && text(node.children).includes(label),
  )[0]
}

describe('OfflineNotice', () => {
  beforeEach(() => {
    Object.assign(mocks.offline, {
      isOnline: false,
      pendingCount: 0,
      isFlushing: false,
      hasFailed: false,
    })
    mocks.store.drops = []
    mocks.store.dismissDrop.mockReset()
    mocks.enqueue.mockReset()
    mocks.push.mockReset()
  })

  it('stays absent without queued or dropped work', () => {
    expect(render().toJSON()).toBeNull()
  })

  it.each([
    [{ pendingCount: 2 }, 'common.queued'],
    [{ pendingCount: 2, isFlushing: true }, 'common.syncing'],
    [{ pendingCount: 2, isOnline: true, hasFailed: true }, 'common.syncRetrying'],
  ])('shows the current queue state', (state, expectedKey) => {
    Object.assign(mocks.offline, state)
    expect(text(render().toJSON())).toContain(expectedKey)
  })

  it('requeues a retryable drop and dismisses its recovery notice', () => {
    const retryableDrop = drop()
    mocks.store.drops = [retryableDrop]
    const tree = render()

    TestRenderer.act(() => action(tree, 'common.syncRetryAction').props.onPress())

    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: 'updateHabit',
      scope: 'habits',
    }))
    expect(mocks.store.dismissDrop).toHaveBeenCalledWith(retryableDrop.id)
  })

  it('cannot requeue a drop cleared by Fresh Start before the Retry press', () => {
    const staleDrop = drop()
    mocks.store.drops = [staleDrop]
    const tree = render()
    mocks.store.drops = []

    TestRenderer.act(() => action(tree, 'common.syncRetryAction').props.onPress())

    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.store.dismissDrop).not.toHaveBeenCalled()
  })

  it('opens habit creation for an orphaned log and dismisses it after recovery', () => {
    const orphanedDrop = drop({
      type: 'logHabit',
      endpoint: '/api/habits/offline-habit-1/logs',
      payload: { date: '2026-09-14' },
    })
    mocks.store.drops = [orphanedDrop]
    const tree = render()

    TestRenderer.act(() => action(tree, 'habits.createHabit').props.onPress())
    const modal = tree.root.findByType('CreateHabitModal')
    expect(modal.props).toMatchObject({ open: true, initialDate: '2026-09-14' })
    TestRenderer.act(() => modal.props.onCreated())
    expect(mocks.store.dismissDrop).toHaveBeenCalledWith(orphanedDrop.id)
  })

  it('routes blocked bulk recovery for review and allows dismissal', () => {
    const blockedDrop = drop({ type: 'bulkLogHabits' })
    mocks.store.drops = [blockedDrop]
    const tree = render()

    TestRenderer.act(() => action(tree, 'common.syncReviewAction').props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/')
    expect(mocks.store.dismissDrop).toHaveBeenCalledWith(blockedDrop.id)

    const dismiss = tree.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === 'common.dismiss',
    )[0]
    TestRenderer.act(() => dismiss.props.onPress())
    expect(mocks.store.dismissDrop).toHaveBeenCalledTimes(2)
  })

  it('briefly confirms when the queue drains', () => {
    mocks.offline.pendingCount = 1
    const tree = render()
    mocks.offline.pendingCount = 0
    TestRenderer.act(() => tree.update(<OfflineNotice />))
    expect(text(tree.toJSON())).toContain('common.synced')
  })
})

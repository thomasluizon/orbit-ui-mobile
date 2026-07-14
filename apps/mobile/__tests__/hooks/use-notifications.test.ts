import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import type { NotificationsResponse } from '@orbit/shared/types/notification'

import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/use-notifications'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    notifications: undefined as NotificationsResponse | undefined,
  }

  const appState = {
    listener: null as ((nextState: string) => void) | null,
    removeCount: 0,
  }

  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueryData: vi.fn((_queryKey: readonly unknown[]) => state.notifications),
    setQueryData: vi.fn((
      _queryKey: readonly unknown[],
      updater: NotificationsResponse | ((old: NotificationsResponse | undefined) => NotificationsResponse | undefined),
    ) => {
      state.notifications = typeof updater === 'function'
        ? updater(state.notifications)
        : updater
    }),
  }

  return {
    state,
    appState,
    queryClient,
    useQuery: vi.fn(() => ({ data: state.notifications })),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => config),
    buildQueuedMutation: vi.fn((options) => ({
      id: 'mutation-1',
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3,
      status: 'pending',
      dependsOn: [],
      lastError: null,
      entityType: null,
      targetEntityId: null,
      clientEntityId: null,
      dedupeKey: null,
      ...options,
    })),
    createQueuedAck: vi.fn((mutationId: string) => ({
      queued: true as const,
      queuedMutationId: mutationId,
    })),
    isQueuedResult: vi.fn((value: unknown) => (
      typeof value === 'object' &&
      value !== null &&
      'queued' in value &&
      (value as { queued?: boolean }).queued === true
    )),
    queueOrExecute: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
}))

vi.mock('react-native', async () => {
  const actual = await import('../../test-mocks/react-native')

  return {
    ...actual,
    AppState: {
      addEventListener: vi.fn((_eventName: string, listener: (nextState: string) => void) => {
        mocks.appState.listener = listener
        return {
          remove: vi.fn(() => {
            mocks.appState.removeCount += 1
            mocks.appState.listener = null
          }),
        }
      }),
    },
  }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: mocks.buildQueuedMutation,
  createQueuedAck: mocks.createQueuedAck,
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
}))

type MutationConfig<TResult, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void
  onSettled?: (
    data: TResult | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void
}

function createNotificationsResponse(): NotificationsResponse {
  return {
    items: [
      {
        id: 'n-1',
        title: 'Unread',
        body: 'Unread body',
        url: null,
        habitId: null,
        isRead: false,
        createdAtUtc: '2025-01-01T00:00:00Z',
      },
      {
        id: 'n-2',
        title: 'Read',
        body: 'Read body',
        url: null,
        habitId: null,
        isRead: true,
        createdAtUtc: '2025-01-01T00:00:00Z',
      },
    ],
    unreadCount: 1,
  }
}

function renderHook(hook: () => unknown): { unmount: () => void } {
  let renderer: { unmount: () => void } | undefined
  function Probe() {
    hook()
    return null
  }
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Probe))
  })
  return { unmount: () => TestRenderer.act(() => renderer?.unmount()) }
}

describe('mobile notification hooks', () => {
  beforeEach(() => {
    mocks.state.notifications = createNotificationsResponse()
    mocks.appState.listener = null
    mocks.appState.removeCount = 0
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.buildQueuedMutation.mockClear()
    mocks.createQueuedAck.mockClear()
    mocks.isQueuedResult.mockClear()
    mocks.queueOrExecute.mockReset()
  })

  it('optimistically marks a notification as read when the mutation is queued offline', async () => {
    const mutation = useMarkNotificationRead() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      string,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue({
      queued: true,
      queuedMutationId: 'mutation-1',
    })

    const context = await mutation.onMutate?.('n-1')
    const result = await mutation.mutationFn('n-1')
    mutation.onSettled?.(result, null, 'n-1', context)

    expect(mocks.state.notifications?.items.find((item) => item.id === 'n-1')?.isRead).toBe(true)
    expect(mocks.state.notifications?.unreadCount).toBe(0)
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(mocks.buildQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'markNotificationRead',
      endpoint: '/api/notifications/n-1/read',
      dedupeKey: 'notification:n-1:read',
    }))
    expect(mocks.queueOrExecute).toHaveBeenCalledTimes(1)
  })

  it('restores the notification cache when delete fails', async () => {
    const mutation = useDeleteNotification() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      string,
      { previous: NotificationsResponse | undefined }
    >
    const initial = mocks.state.notifications
    mocks.queueOrExecute.mockRejectedValue(new Error('Delete failed'))

    const context = await mutation.onMutate?.('n-1')

    await expect(mutation.mutationFn('n-1')).rejects.toThrow('Delete failed')
    mutation.onError?.(new Error('Delete failed'), 'n-1', context)

    expect(mocks.state.notifications).toEqual(initial)
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      notificationKeys.lists(),
      initial,
    )
  })

  it('derives the unread badge and item list from the query cache', () => {
    const results: ReturnType<typeof useNotifications>[] = []
    const handle = renderHook(() => {
      results.push(useNotifications())
    })

    const latest = results.at(-1)!
    expect(latest.notifications.map((item) => item.id)).toEqual(['n-1', 'n-2'])
    expect(latest.unreadCount).toBe(1)

    handle.unmount()
  })

  it('falls back to an empty list and zero badge when the cache is cold', () => {
    mocks.state.notifications = undefined
    const results: ReturnType<typeof useNotifications>[] = []
    const handle = renderHook(() => {
      results.push(useNotifications())
    })

    const latest = results.at(-1)!
    expect(latest.notifications).toEqual([])
    expect(latest.unreadCount).toBe(0)

    handle.unmount()
  })

  it('polls the notification list on an interval and stops on unmount', () => {
    vi.useFakeTimers()
    try {
      const handle = renderHook(() => useNotifications())
      expect(mocks.appState.listener).toBeTypeOf('function')

      mocks.queryClient.invalidateQueries.mockClear()
      vi.advanceTimersByTime(NOTIFICATIONS_REFETCH_INTERVAL)
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: notificationKeys.lists(),
      })

      handle.unmount()
      mocks.queryClient.invalidateQueries.mockClear()
      vi.advanceTimersByTime(NOTIFICATIONS_REFETCH_INTERVAL * 3)
      expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
      expect(mocks.appState.removeCount).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refetches immediately when the app returns to the foreground', () => {
    const handle = renderHook(() => useNotifications())

    mocks.queryClient.invalidateQueries.mockClear()
    mocks.appState.listener?.('active')

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })

    mocks.queryClient.invalidateQueries.mockClear()
    mocks.appState.listener?.('background')
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()

    handle.unmount()
  })

  it('invalidates the list after a mark-read confirms online', async () => {
    const mutation = useMarkNotificationRead() as unknown as MutationConfig<
      unknown,
      string,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const context = await mutation.onMutate?.('n-1')
    const result = await mutation.mutationFn('n-1')
    mutation.onSettled?.(result, null, 'n-1', context)

    expect(mocks.state.notifications?.unreadCount).toBe(0)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })
  })

  it('keeps the unread badge when a read notification is removed', async () => {
    const mutation = useDeleteNotification() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      string,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue({ queued: true, queuedMutationId: 'mutation-1' })

    await mutation.onMutate?.('n-2')

    expect(mocks.state.notifications?.items.map((item) => item.id)).toEqual(['n-1'])
    expect(mocks.state.notifications?.unreadCount).toBe(1)
  })

  it('optimistically marks every notification read and skips invalidation when queued', async () => {
    const mutation = useMarkAllNotificationsRead() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      void,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue({ queued: true, queuedMutationId: 'mutation-1' })

    const context = await mutation.onMutate?.()
    const result = await mutation.mutationFn()
    mutation.onSettled?.(result, null, undefined, context)

    expect(mocks.state.notifications?.items.every((item) => item.isRead)).toBe(true)
    expect(mocks.state.notifications?.unreadCount).toBe(0)
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(mocks.buildQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'markAllNotificationsRead',
      dedupeKey: 'notifications:mark-all-read',
    }))
  })

  it('restores the list when mark-all-read fails', async () => {
    const mutation = useMarkAllNotificationsRead() as unknown as MutationConfig<
      unknown,
      void,
      { previous: NotificationsResponse | undefined }
    >
    const initial = mocks.state.notifications

    const context = await mutation.onMutate?.()
    expect(mocks.state.notifications?.unreadCount).toBe(0)

    mutation.onError?.(new Error('boom'), undefined, context)
    expect(mocks.state.notifications).toEqual(initial)
  })

  it('empties the list optimistically on delete-all and invalidates online', async () => {
    const mutation = useDeleteAllNotifications() as unknown as MutationConfig<
      unknown,
      void,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const context = await mutation.onMutate?.()
    expect(mocks.state.notifications).toEqual({ items: [], unreadCount: 0 })

    const result = await mutation.mutationFn()
    mutation.onSettled?.(result, null, undefined, context)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })
  })

  it('restores the list when delete-all fails', async () => {
    const mutation = useDeleteAllNotifications() as unknown as MutationConfig<
      unknown,
      void,
      { previous: NotificationsResponse | undefined }
    >
    const initial = mocks.state.notifications

    const context = await mutation.onMutate?.()
    expect(mocks.state.notifications?.items).toEqual([])

    mutation.onError?.(new Error('boom'), undefined, context)
    expect(mocks.state.notifications).toEqual(initial)
  })
})

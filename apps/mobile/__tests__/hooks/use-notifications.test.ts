import React from 'react'
import { focusManager } from '@tanstack/query-core'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import type { NotificationsResponse } from '@orbit/shared/types/notification'
import { i18n } from '@/lib/i18n'
import { apiClient } from '@/lib/api-client'

import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/use-notifications'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const TestRenderer = require('react-test-renderer')
const feedback = vi.hoisted(() => ({ showError: vi.fn() }))
const session = vi.hoisted(() => ({ epoch: 1 }))
const translation = vi.hoisted(() => ({
  t: (key: string, _values?: Record<string, unknown>) => key,
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: translation.t }) }
})
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: feedback.showError }),
}))
vi.mock('@/stores/auth-store', () => ({
  getSessionGeneration: () => ({ epoch: session.epoch, credentialVersion: 1 }),
}))
vi.mock('@/lib/session-epoch', () => ({
  getSessionEpoch: () => session.epoch,
}))

const mocks = vi.hoisted(() => {
  const state = {
    notifications: undefined as NotificationsResponse | undefined,
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
    queryClient,
    useQuery: vi.fn(() => ({ data: state.notifications })),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => {
      const mutation = config as {
        mutationFn: (variables: unknown) => Promise<unknown>
        onMutate?: (variables: unknown) => unknown
        onError?: (error: Error, variables: unknown, context: unknown) => void
        onSettled?: (data: unknown, error: Error | null, variables: unknown, context: unknown) => void
      }
      const mutateAsync = async (variables: unknown) => {
        const context = await mutation.onMutate?.(variables)
        try {
          const result = await mutation.mutationFn(variables)
          mutation.onSettled?.(result, null, variables, context)
          return result
        } catch (error: unknown) {
          mutation.onError?.(error as Error, variables, context)
          mutation.onSettled?.(undefined, error as Error, variables, context)
          throw error
        }
      }

      return {
        ...mutation,
        mutate: (variables: unknown) => { void mutateAsync(variables) },
        mutateAsync,
      }
    }),
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

type MarkReadOperation = { notificationId: string; sessionEpoch: number }
type BulkOperation = { sessionEpoch: number }

function markReadOperation(notificationId: string): MarkReadOperation {
  return { notificationId, sessionEpoch: session.epoch }
}

function bulkOperation(): BulkOperation {
  return { sessionEpoch: session.epoch }
}

type LateFailureMutation = {
  onMutate?: (variables: unknown) => unknown
  onError?: (error: Error, variables: unknown, context: unknown) => void
  onSettled?: (data: unknown, error: Error | null, variables: unknown, context: unknown) => void
}

function replacementAccountNotificationsFixture(): NotificationsResponse {
  return {
    items: [{
      id: 'account-b-notification',
      title: 'Account B',
      body: 'Account B body',
      url: null,
      habitId: null,
      isRead: false,
      createdAtUtc: '2025-01-02T00:00:00Z',
    }],
    unreadCount: 1,
  }
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
    translation.t = i18n.t.bind(i18n)
    feedback.showError.mockReset()
    session.epoch = 1
    mocks.state.notifications = createNotificationsResponse()
    focusManager.setFocused(true)
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
    vi.mocked(apiClient).mockReset()
  })

  it.each([
    ['mark one read', () => useMarkNotificationRead(), () => markReadOperation('n-1')],
    ['mark all read', () => useMarkAllNotificationsRead(), bulkOperation],
    ['delete one', () => useDeleteNotification(), () => markReadOperation('n-1')],
    ['delete all', () => useDeleteAllNotifications(), bulkOperation],
  ] as const)('keeps a %s tied to its account through offline preflight and token loading', async (_name, createMutation, buildOperation) => {
    const mutation = createMutation() as unknown as MutationConfig<unknown, MarkReadOperation | BulkOperation, unknown>
    const operation = buildOperation()
    vi.mocked(apiClient).mockResolvedValue(undefined)
    mocks.queueOrExecute.mockImplementation(async ({ isCurrent, execute }) => {
      expect(isCurrent()).toBe(true)
      await execute({})
      const requestOptions = vi.mocked(apiClient).mock.lastCall?.[1] as { isCurrent?: () => boolean }
      expect(requestOptions.isCurrent?.()).toBe(true)
      session.epoch = 2
      expect(isCurrent()).toBe(false)
      expect(requestOptions.isCurrent?.()).toBe(false)
    })

    await mutation.mutationFn(operation)
  })

  it('optimistically marks a notification as read when the mutation is queued offline', async () => {
    const mutation = useMarkNotificationRead() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      MarkReadOperation,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue({
      queued: true,
      queuedMutationId: 'mutation-1',
    })

    const operation = markReadOperation('n-1')
    const context = await mutation.onMutate?.(operation)
    const result = await mutation.mutationFn(operation)
    mutation.onSettled?.(result, null, operation, context)

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
    const mutation = useDeleteNotification() as unknown as {
      mutateAsync: (notificationId: string) => Promise<unknown>
    }
    const initial = mocks.state.notifications
    mocks.queueOrExecute.mockRejectedValue(new Error('Delete failed'))

    await expect(mutation.mutateAsync('n-1')).rejects.toThrow('Delete failed')

    expect(mocks.state.notifications).toEqual(initial)
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      notificationKeys.lists(),
      initial,
    )
  })

  it('ignores a delete rejection from a replaced session', async () => {
    const mutation = useDeleteNotification() as unknown as MutationConfig<
      unknown,
      { notificationId: string; sessionEpoch: number },
      { previous: NotificationsResponse | undefined; sessionEpoch: number }
    >
    const operation = { notificationId: 'n-1', sessionEpoch: session.epoch }
    const context = await mutation.onMutate?.(operation)
    const replacementAccountNotifications: NotificationsResponse = {
      items: [{
        id: 'account-b-notification',
        title: 'Account B',
        body: 'Account B body',
        url: null,
        habitId: null,
        isRead: false,
        createdAtUtc: '2025-01-02T00:00:00Z',
      }],
      unreadCount: 1,
    }

    session.epoch = 2
    mocks.state.notifications = replacementAccountNotifications
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()

    mutation.onError?.(new Error('Late delete failure'), operation, context)
    mutation.onSettled?.(undefined, new Error('Late delete failure'), operation, context)

    expect(mocks.state.notifications).toEqual(replacementAccountNotifications)
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it.each([
    ['mark one read', () => useMarkNotificationRead(), () => markReadOperation('n-1')],
    ['mark all read', () => useMarkAllNotificationsRead(), bulkOperation],
    ['clear all', () => useDeleteAllNotifications(), bulkOperation],
  ] as const)('ignores a %s rejection from a replaced session', async (_name, createMutation, buildOperation) => {
    const mutation = createMutation() as unknown as LateFailureMutation
    const variables = buildOperation()
    const context = await mutation.onMutate?.(variables)

    session.epoch = 2
    mocks.state.notifications = replacementAccountNotificationsFixture()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    feedback.showError.mockClear()

    const failure = new Error('Late failure from the replaced session')
    mutation.onError?.(failure, variables, context)
    mutation.onSettled?.(undefined, failure, variables, context)

    expect(mocks.state.notifications).toEqual(replacementAccountNotificationsFixture())
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(feedback.showError).not.toHaveBeenCalled()
  })

  it('does not start a delete after the session changes while query cancellation is pending', async () => {
    let releaseCancellation!: () => void
    mocks.queryClient.cancelQueries.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseCancellation = resolve
    }))
    const mutation = useDeleteNotification() as unknown as {
      mutateAsync: (notificationId: string) => Promise<unknown>
    }
    const replacementAccountNotifications: NotificationsResponse = {
      items: [{
        id: 'account-b-notification',
        title: 'Account B',
        body: 'Account B body',
        url: null,
        habitId: null,
        isRead: false,
        createdAtUtc: '2025-01-02T00:00:00Z',
      }],
      unreadCount: 1,
    }

    const deletePromise = mutation.mutateAsync('n-1')
    await Promise.resolve()
    session.epoch = 2
    mocks.state.notifications = replacementAccountNotifications
    mocks.queryClient.setQueryData.mockClear()
    releaseCancellation()
    await deletePromise

    expect(mocks.queueOrExecute).not.toHaveBeenCalled()
    expect(mocks.state.notifications).toEqual(replacementAccountNotifications)
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it.each([
    ['mark one read', () => useMarkNotificationRead(), 'n-1'],
    ['mark all read', () => useMarkAllNotificationsRead(), undefined],
    ['clear all', () => useDeleteAllNotifications(), undefined],
  ] as const)(
    'does not send a %s after the session changes while query cancellation is pending',
    async (_name, createMutation, notificationId) => {
      let releaseCancellation!: () => void
      mocks.queryClient.cancelQueries.mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseCancellation = resolve
      }))
      mocks.queueOrExecute.mockResolvedValue(undefined)
      const mutation = createMutation() as unknown as {
        mutateAsync: (notificationId?: string) => Promise<unknown>
      }

      const pending = mutation.mutateAsync(notificationId)
      await Promise.resolve()
      session.epoch = 2
      mocks.state.notifications = replacementAccountNotificationsFixture()
      mocks.queryClient.setQueryData.mockClear()
      mocks.queryClient.invalidateQueries.mockClear()
      feedback.showError.mockClear()
      releaseCancellation()
      await pending

      expect(mocks.queueOrExecute).not.toHaveBeenCalled()
      expect(mocks.state.notifications).toEqual(replacementAccountNotificationsFixture())
      expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
      expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
      expect(feedback.showError).not.toHaveBeenCalled()
    },
  )

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
      expect(focusManager.hasListeners()).toBe(true)

      mocks.queryClient.invalidateQueries.mockClear()
      vi.advanceTimersByTime(NOTIFICATIONS_REFETCH_INTERVAL)
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: notificationKeys.lists(),
      })

      handle.unmount()
      mocks.queryClient.invalidateQueries.mockClear()
      vi.advanceTimersByTime(NOTIFICATIONS_REFETCH_INTERVAL * 3)
      expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
      expect(focusManager.hasListeners()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('pauses polling through query focus and waits for the next interval after foreground', () => {
    vi.useFakeTimers()
    const handle = renderHook(() => useNotifications())
    try {
      focusManager.setFocused(false)
      vi.advanceTimersByTime(NOTIFICATIONS_REFETCH_INTERVAL)
      expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
      focusManager.setFocused(true)
      expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
      vi.advanceTimersByTime(NOTIFICATIONS_REFETCH_INTERVAL)
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledExactlyOnceWith({
        queryKey: notificationKeys.lists(),
      })
    } finally {
      handle.unmount()
      vi.useRealTimers()
    }
  })

  it('invalidates the list after a mark-read confirms online', async () => {
    const mutation = useMarkNotificationRead() as unknown as MutationConfig<
      unknown,
      MarkReadOperation,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const operation = markReadOperation('n-1')
    const context = await mutation.onMutate?.(operation)
    const result = await mutation.mutationFn(operation)
    mutation.onSettled?.(result, null, operation, context)

    expect(mocks.state.notifications?.unreadCount).toBe(0)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })
  })

  it('keeps the unread badge when a read notification is removed', async () => {
    const mutation = useDeleteNotification() as unknown as {
      mutateAsync: (notificationId: string) => Promise<unknown>
    }
    mocks.queueOrExecute.mockResolvedValue({ queued: true, queuedMutationId: 'mutation-1' })

    await mutation.mutateAsync('n-2')

    expect(mocks.state.notifications?.items.map((item) => item.id)).toEqual(['n-1'])
    expect(mocks.state.notifications?.unreadCount).toBe(1)
  })

  it('optimistically marks every notification read and skips invalidation when queued', async () => {
    const mutation = useMarkAllNotificationsRead() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      BulkOperation,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue({ queued: true, queuedMutationId: 'mutation-1' })

    const operation = bulkOperation()
    const context = await mutation.onMutate?.(operation)
    const result = await mutation.mutationFn(operation)
    mutation.onSettled?.(result, null, operation, context)

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
      BulkOperation,
      { previous: NotificationsResponse | undefined }
    >
    const initial = mocks.state.notifications
    const operation = bulkOperation()

    const context = await mutation.onMutate?.(operation)
    expect(mocks.state.notifications?.unreadCount).toBe(0)

    mutation.onError?.(new Error('boom'), operation, context)
    expect(mocks.state.notifications).toEqual(initial)
  })

  it('empties the list optimistically on delete-all and invalidates online', async () => {
    const mutation = useDeleteAllNotifications() as unknown as MutationConfig<
      unknown,
      BulkOperation,
      { previous: NotificationsResponse | undefined }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const operation = bulkOperation()
    const context = await mutation.onMutate?.(operation)
    expect(mocks.state.notifications).toEqual({ items: [], unreadCount: 0 })

    const result = await mutation.mutationFn(operation)
    mutation.onSettled?.(result, null, operation, context)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notificationKeys.lists(),
    })
  })

  it('restores the list when delete-all fails', async () => {
    const mutation = useDeleteAllNotifications() as unknown as MutationConfig<
      unknown,
      BulkOperation,
      { previous: NotificationsResponse | undefined }
    >
    const initial = mocks.state.notifications
    const operation = bulkOperation()

    const context = await mutation.onMutate?.(operation)
    expect(mocks.state.notifications?.items).toEqual([])

    mutation.onError?.(new Error('boom'), operation, context)
    expect(mocks.state.notifications).toEqual(initial)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationKeys } from '@orbit/shared/query'
import type { NotificationsResponse } from '@orbit/shared/types/notification'

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
      addEventListener: vi.fn(() => ({
        remove: () => {},
      })),
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

import {
  useDeleteNotification,
  useMarkNotificationRead,
} from '@/hooks/use-notifications'

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

describe('mobile notification hooks', () => {
  beforeEach(() => {
    mocks.state.notifications = createNotificationsResponse()
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
})

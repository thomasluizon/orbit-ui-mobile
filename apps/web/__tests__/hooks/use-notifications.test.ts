import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
} from '@/hooks/use-notifications'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import type { NotificationsResponse } from '@orbit/shared/types/notification'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock server actions
vi.mock('@/app/actions/notifications', () => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
  }
}

function mockNotificationsResponse(response: NotificationsResponse) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  })
}

describe('useNotifications', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and returns notifications', async () => {
    const response: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: true }),
      ],
      unreadCount: 1,
    }
    mockNotificationsResponse(response)

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.notifications).toHaveLength(2)
    expect(result.current.unreadCount).toBe(1)
  })

  it('returns empty list when no notifications', async () => {
    mockNotificationsResponse({ items: [], unreadCount: 0 })

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  it('defaults notifications and unreadCount when data is undefined', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // Never resolves

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    })

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  // Polling is now handled by TanStack Query's refetchInterval option,
  // so there are no manual visibilitychange listeners to test.
})

describe('useMarkNotificationRead', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls markNotificationRead action', async () => {
    const { markNotificationRead } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(markNotificationRead)
    mockedAction.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('n-1')
    })

    expect(mockedAction).toHaveBeenCalledWith('n-1')
  })
})

describe('useMarkAllNotificationsRead', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls markAllNotificationsRead action', async () => {
    const { markAllNotificationsRead } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(markAllNotificationsRead)
    mockedAction.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mockedAction).toHaveBeenCalled()
  })
})

describe('useMarkNotificationRead optimistic update', () => {
  it('optimistically marks notification as read and decrements unread count', async () => {
    const { markNotificationRead } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(markNotificationRead)
    // Delay resolution to observe optimistic state
    mockedAction.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(undefined as any), 100)))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: true }),
      ],
      unreadCount: 1,
    }

    // Seed the cache
    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    // Prevent refetches from overwriting optimistic state
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate('n-1')
      // Give the onMutate a tick to run
      await new Promise((r) => setTimeout(r, 0))
    })

    // Check optimistic state in cache
    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items.find((n) => n.id === 'n-1')?.isRead).toBe(true)
    expect(cached?.unreadCount).toBe(0)
  })
})

describe('useMarkAllNotificationsRead optimistic update', () => {
  it('optimistically marks all notifications as read', async () => {
    const { markAllNotificationsRead } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(markAllNotificationsRead)
    mockedAction.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(undefined as any), 100)))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: false }),
        createMockNotification({ id: 'n-3', isRead: true }),
      ],
      unreadCount: 2,
    }

    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate()
      await new Promise((r) => setTimeout(r, 0))
    })

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items.every((n) => n.isRead)).toBe(true)
    expect(cached?.unreadCount).toBe(0)
  })

  it('rolls back on error', async () => {
    const { markAllNotificationsRead } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(markAllNotificationsRead)
    mockedAction.mockRejectedValue(new Error('Server error'))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: false }),
      ],
      unreadCount: 2,
    }

    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync()
      } catch {
        // Expected to fail
      }
    })

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(2)
    expect(cached?.unreadCount).toBe(2)
  })
})

describe('useDeleteNotification', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls deleteNotification action', async () => {
    const { deleteNotification } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(deleteNotification)
    mockedAction.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useDeleteNotification(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('n-1')
    })

    expect(mockedAction).toHaveBeenCalledWith('n-1')
  })

  it('rolls back on error', async () => {
    const { deleteNotification } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(deleteNotification)
    mockedAction.mockRejectedValue(new Error('Server error'))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: true }),
      ],
      unreadCount: 1,
    }

    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    // Prevent refetches from overwriting
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useDeleteNotification(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync('n-1')
      } catch {
        // Expected to fail
      }
    })

    // Cache should be rolled back to include n-1 again
    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(2)
    expect(cached?.items.find((n) => n.id === 'n-1')).toBeDefined()
  })

  it('optimistically removes the notification and adjusts unread count', async () => {
    const { deleteNotification } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(deleteNotification)
    mockedAction.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(undefined as any), 100)))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: true }),
      ],
      unreadCount: 1,
    }

    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useDeleteNotification(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate('n-1')
      await new Promise((r) => setTimeout(r, 0))
    })

    // Check optimistic state
    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(1)
    expect(cached?.items.find((n) => n.id === 'n-1')).toBeUndefined()
    expect(cached?.unreadCount).toBe(0)
  })
})

describe('useDeleteAllNotifications', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls deleteAllNotifications action', async () => {
    const { deleteAllNotifications } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(deleteAllNotifications)
    mockedAction.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useDeleteAllNotifications(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mockedAction).toHaveBeenCalled()
  })

  it('rolls back on error', async () => {
    const { deleteAllNotifications } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(deleteAllNotifications)
    mockedAction.mockRejectedValue(new Error('Server error'))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: true }),
      ],
      unreadCount: 1,
    }

    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    // Prevent refetches from overwriting
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useDeleteAllNotifications(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync()
      } catch {
        // Expected to fail
      }
    })

    // Cache should be rolled back to include both notifications
    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(2)
    expect(cached?.unreadCount).toBe(1)
  })

  it('optimistically clears all notifications', async () => {
    const { deleteAllNotifications } = await import('@/app/actions/notifications')
    const mockedAction = vi.mocked(deleteAllNotifications)
    mockedAction.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(undefined as any), 100)))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const initialData: NotificationsResponse = {
      items: [
        createMockNotification({ id: 'n-1', isRead: false }),
        createMockNotification({ id: 'n-2', isRead: true }),
      ],
      unreadCount: 1,
    }

    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), initialData)

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialData),
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useDeleteAllNotifications(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Check optimistic state
    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toEqual([])
    expect(cached?.unreadCount).toBe(0)
  })
})

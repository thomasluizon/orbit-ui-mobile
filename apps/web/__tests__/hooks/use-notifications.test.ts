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
    // Mock document.addEventListener for visibility change
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})
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
})

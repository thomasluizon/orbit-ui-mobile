import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
import { useAuthStore } from '@/stores/auth-store'
import { subscribeToAccountSignal } from '@/lib/cross-tab-account-signal'

const feedback = vi.hoisted(() => ({ showError: vi.fn() }))

vi.mock('next-intl', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  return { useTranslations: () => createTranslator({ locale: 'en', messages }) }
})
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: feedback.showError }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/actions/notifications', () => ({
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
    feedback.showError.mockReset()
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
    mockFetch.mockReturnValue(new Promise(() => {}))

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
    feedback.showError.mockReset()
  })

  it('calls markNotificationRead action under the account that asked for it', async () => {
    const { markNotificationRead } = await import('@/lib/actions/notifications')
    const mockedAction = vi.mocked(markNotificationRead)
    mockedAction.mockResolvedValue(undefined as any)
    useAuthStore.getState().setAuth({
      userId: 'account-a',
      name: 'Account A',
      email: 'account-a@example.com',
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('n-1')
    })

    expect(mockedAction).toHaveBeenCalledWith('n-1', 'account-a')
  })
})

describe('useMarkAllNotificationsRead', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls markAllNotificationsRead action', async () => {
    const { markAllNotificationsRead } = await import('@/lib/actions/notifications')
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
    const { markNotificationRead } = await import('@/lib/actions/notifications')
    const mockedAction = vi.mocked(markNotificationRead)
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

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate('n-1')
      await new Promise((r) => setTimeout(r, 0))
    })

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items.find((n) => n.id === 'n-1')?.isRead).toBe(true)
    expect(cached?.unreadCount).toBe(0)
  })
})

describe('useMarkAllNotificationsRead optimistic update', () => {
  it('optimistically marks all notifications as read', async () => {
    const { markAllNotificationsRead } = await import('@/lib/actions/notifications')
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
    const { markAllNotificationsRead } = await import('@/lib/actions/notifications')
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
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
  })

  it('calls deleteNotification action under the account that asked for it', async () => {
    const { deleteNotification } = await import('@/lib/actions/notifications')
    const mockedAction = vi.mocked(deleteNotification)
    useAuthStore.getState().setAuth({
      userId: 'account-a',
      name: 'Account A',
      email: 'account-a@example.com',
    })
    mockedAction.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useDeleteNotification(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('n-1')
    })

    expect(mockedAction).toHaveBeenCalledWith('n-1', 'account-a')
  })

  it('rolls back on error', async () => {
    const { deleteNotification } = await import('@/lib/actions/notifications')
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
      }
    })

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(2)
    expect(cached?.items.find((n) => n.id === 'n-1')).toBeDefined()
  })

  it('optimistically removes the notification and adjusts unread count', async () => {
    const { deleteNotification } = await import('@/lib/actions/notifications')
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

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(1)
    expect(cached?.items.find((n) => n.id === 'n-1')).toBeUndefined()
    expect(cached?.unreadCount).toBe(0)
  })

  it('ignores a delete rejection from a replaced session', async () => {
    const { deleteNotification } = await import('@/lib/actions/notifications')
    const mockedAction = vi.mocked(deleteNotification)
    let rejectDelete!: (error: Error) => void
    mockedAction.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectDelete = reject
    }))
    useAuthStore.getState().setAuth({
      userId: 'account-a',
      name: 'Account A',
      email: 'account-a@example.com',
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const accountANotifications: NotificationsResponse = {
      items: [createMockNotification({ id: 'account-a-notification', isRead: false })],
      unreadCount: 1,
    }
    const accountBNotifications: NotificationsResponse = {
      items: [createMockNotification({ id: 'account-b-notification', isRead: false })],
      unreadCount: 1,
    }
    const { notificationKeys } = await import('@orbit/shared/query')
    queryClient.setQueryData(notificationKeys.lists(), accountANotifications)
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useDeleteNotification(), { wrapper: Wrapper })
    let deletePromise!: Promise<unknown>
    await act(async () => {
      deletePromise = result.current.mutateAsync('account-a-notification')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await useAuthStore.getState().logout()
    useAuthStore.getState().setAuth({
      userId: 'account-b',
      name: 'Account B',
      email: 'account-b@example.com',
    })
    queryClient.setQueryData(notificationKeys.lists(), accountBNotifications)
    invalidateQueries.mockClear()

    await act(async () => {
      rejectDelete(new Error('Late delete failure'))
      await deletePromise.catch(() => undefined)
    })

    expect(queryClient.getQueryData(notificationKeys.lists())).toEqual(accountBNotifications)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('does not start a delete after the session changes while query cancellation is pending', async () => {
    const { deleteNotification } = await import('@/lib/actions/notifications')
    const { notificationKeys } = await import('@orbit/shared/query')
    const mockedAction = vi.mocked(deleteNotification)
    mockedAction.mockResolvedValue(undefined as never)
    useAuthStore.getState().setAuth({
      userId: 'account-a',
      name: 'Account A',
      email: 'account-a@example.com',
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    let releaseCancellation!: () => void
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries').mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseCancellation = resolve
      }),
    )
    const accountANotifications: NotificationsResponse = {
      items: [createMockNotification({ id: 'account-a-notification', isRead: false })],
      unreadCount: 1,
    }
    const accountBNotifications: NotificationsResponse = {
      items: [createMockNotification({ id: 'account-b-notification', isRead: false })],
      unreadCount: 1,
    }
    queryClient.setQueryData(notificationKeys.lists(), accountANotifications)

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    const { result } = renderHook(() => useDeleteNotification(), { wrapper: Wrapper })
    let deletePromise!: Promise<unknown>
    act(() => {
      deletePromise = result.current.mutateAsync('account-a-notification')
    })
    await waitFor(() => expect(cancelQueries).toHaveBeenCalled())

    mockFetch.mockResolvedValue({ ok: true })
    await useAuthStore.getState().logout()
    useAuthStore.getState().setAuth({
      userId: 'account-b',
      name: 'Account B',
      email: 'account-b@example.com',
    })
    queryClient.setQueryData(notificationKeys.lists(), accountBNotifications)
    mockedAction.mockClear()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    releaseCancellation()

    await act(async () => {
      await deletePromise
    })

    expect(mockedAction).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(notificationKeys.lists())).toEqual(accountBNotifications)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })
})

describe('useDeleteAllNotifications', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls deleteAllNotifications action', async () => {
    const { deleteAllNotifications } = await import('@/lib/actions/notifications')
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
    const { deleteAllNotifications } = await import('@/lib/actions/notifications')
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
      }
    })

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toHaveLength(2)
    expect(cached?.unreadCount).toBe(1)
  })

  it('optimistically clears all notifications', async () => {
    const { deleteAllNotifications } = await import('@/lib/actions/notifications')
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

    const cached = queryClient.getQueryData<NotificationsResponse>(notificationKeys.lists())
    expect(cached?.items).toEqual([])
    expect(cached?.unreadCount).toBe(0)
  })
})

describe('notification mutations across an account switch', () => {
  const accountANotifications: NotificationsResponse = {
    items: [createMockNotification({ id: 'account-a-notification', isRead: false })],
    unreadCount: 1,
  }
  const accountBNotifications: NotificationsResponse = {
    items: [createMockNotification({ id: 'account-b-notification', isRead: false })],
    unreadCount: 1,
  }

  beforeEach(() => {
    mockFetch.mockReset()
    respondToSessionCheckWith('account-a')
    feedback.showError.mockReset()
  })

  function readRequestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input
    return input instanceof URL ? input.href : input.url
  }

  /**
   * Answers the session endpoint with one account and everything else with the notification list,
   * so the tab's own session check cannot be what notices the replacement.
   */
  function respondToSessionCheckWith(accountId: string) {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      if (readRequestUrl(input).includes('/api/auth/session')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            expiresAt: Date.now() + 3600000,
            userId: accountId,
            refreshFailed: false,
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(accountBNotifications) })
    })
  }

  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  /** A second tab, whose channel stays open because a closed one delivers nothing. */
  let otherTab: BroadcastChannel | null = null

  afterEach(() => {
    otherTab?.close()
    otherTab = null
  })

  /**
   * Posts the signal and waits for this tab to receive it, on the same channel the store listens
   * on. Delivery runs on the event loop rather than on a timer, and both listeners run in one
   * dispatch, so a signal this one has seen the store has seen too.
   */
  async function announceAccountFromAnotherTab(accountId: string): Promise<void> {
    otherTab ??= new BroadcastChannel('orbit-account-signal')
    const delivered: string[] = []
    const stopRecording = subscribeToAccountSignal((received) => {
      if (received !== null) delivered.push(received)
    })
    otherTab.postMessage({ accountId })
    await vi.waitFor(() => expect(delivered).toContain(accountId))
    stopRecording()
  }

  async function startAccountASession(options: { stallCancellation?: boolean } = {}) {
    const { notificationKeys } = await import('@orbit/shared/query')
    useAuthStore.getState().setAuth({
      userId: 'account-a',
      name: 'Account A',
      email: 'account-a@example.com',
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(notificationKeys.lists(), accountANotifications)
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries')
    let releaseCancellation: () => void = () => {}
    if (options.stallCancellation) {
      cancelQueries.mockImplementationOnce(
        () => new Promise<void>((resolve) => {
          releaseCancellation = resolve
        }),
      )
    }

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    }

    function seedReplacementAccount() {
      queryClient.setQueryData(notificationKeys.lists(), accountBNotifications)
      invalidateQueries.mockClear()
      feedback.showError.mockClear()
    }

    return {
      Wrapper,
      cancelQueries,
      queryClient,
      releaseCancellation: () => releaseCancellation(),
      seedReplacementAccount,
      replaceAccount: async () => {
        await useAuthStore.getState().logout()
        useAuthStore.getState().setAuth({
          userId: 'account-b',
          name: 'Account B',
          email: 'account-b@example.com',
        })
        seedReplacementAccount()
      },
      expectReplacementAccountUntouched: () => {
        expect(queryClient.getQueryData(notificationKeys.lists())).toEqual(accountBNotifications)
        expect(invalidateQueries).not.toHaveBeenCalled()
        expect(feedback.showError).not.toHaveBeenCalled()
      },
    }
  }

  it('ignores a mark one read rejection from a replaced session', async () => {
    const { markNotificationRead } = await import('@/lib/actions/notifications')
    let rejectAction!: (error: Error) => void
    vi.mocked(markNotificationRead).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectAction = reject
    }))
    const scenario = await startAccountASession()
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    await act(async () => {
      pending = result.current.mutateAsync('account-a-notification')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await scenario.replaceAccount()

    await act(async () => {
      rejectAction(new Error('Late mark read failure'))
      await pending.catch(() => undefined)
    })

    scenario.expectReplacementAccountUntouched()
  })

  it('ignores a mark all read rejection from a replaced session', async () => {
    const { markAllNotificationsRead } = await import('@/lib/actions/notifications')
    let rejectAction!: (error: Error) => void
    vi.mocked(markAllNotificationsRead).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectAction = reject
    }))
    const scenario = await startAccountASession()
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    await act(async () => {
      pending = result.current.mutateAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await scenario.replaceAccount()

    await act(async () => {
      rejectAction(new Error('Late mark all read failure'))
      await pending.catch(() => undefined)
    })

    scenario.expectReplacementAccountUntouched()
  })

  it('ignores a clear all rejection from a replaced session', async () => {
    const { deleteAllNotifications } = await import('@/lib/actions/notifications')
    let rejectAction!: (error: Error) => void
    vi.mocked(deleteAllNotifications).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectAction = reject
    }))
    const scenario = await startAccountASession()
    const { result } = renderHook(() => useDeleteAllNotifications(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    await act(async () => {
      pending = result.current.mutateAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await scenario.replaceAccount()

    await act(async () => {
      rejectAction(new Error('Late clear all failure'))
      await pending.catch(() => undefined)
    })

    scenario.expectReplacementAccountUntouched()
  })

  it('does not mark one read under the account that replaced the sender', async () => {
    const { markNotificationRead } = await import('@/lib/actions/notifications')
    const action = vi.mocked(markNotificationRead)
    action.mockResolvedValue(undefined as never)
    const scenario = await startAccountASession({ stallCancellation: true })
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.mutateAsync('account-a-notification')
    })
    await waitFor(() => expect(scenario.cancelQueries).toHaveBeenCalled())

    await scenario.replaceAccount()
    action.mockClear()
    scenario.releaseCancellation()
    await act(async () => {
      await pending
    })

    expect(action).not.toHaveBeenCalled()
    scenario.expectReplacementAccountUntouched()
  })

  it('does not mark all read under the account that replaced the sender', async () => {
    const { markAllNotificationsRead } = await import('@/lib/actions/notifications')
    const action = vi.mocked(markAllNotificationsRead)
    action.mockResolvedValue(undefined as never)
    const scenario = await startAccountASession({ stallCancellation: true })
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.mutateAsync()
    })
    await waitFor(() => expect(scenario.cancelQueries).toHaveBeenCalled())

    await scenario.replaceAccount()
    action.mockClear()
    scenario.releaseCancellation()
    await act(async () => {
      await pending
    })

    expect(action).not.toHaveBeenCalled()
    scenario.expectReplacementAccountUntouched()
  })

  it('does not clear the notifications of the account that replaced the sender', async () => {
    const { deleteAllNotifications } = await import('@/lib/actions/notifications')
    const action = vi.mocked(deleteAllNotifications)
    action.mockResolvedValue(undefined as never)
    const scenario = await startAccountASession({ stallCancellation: true })
    const { result } = renderHook(() => useDeleteAllNotifications(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.mutateAsync()
    })
    await waitFor(() => expect(scenario.cancelQueries).toHaveBeenCalled())

    await scenario.replaceAccount()
    action.mockClear()
    scenario.releaseCancellation()
    await act(async () => {
      await pending
    })

    expect(action).not.toHaveBeenCalled()
    scenario.expectReplacementAccountUntouched()
  })

  it('ignores a clear all rejection from a session a cross-tab signal replaced', async () => {
    const { deleteAllNotifications } = await import('@/lib/actions/notifications')
    let rejectAction!: (error: Error) => void
    vi.mocked(deleteAllNotifications).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectAction = reject
    }))
    const scenario = await startAccountASession()
    const stopMonitor = useAuthStore.getState().startExpiryMonitor()
    await settle()
    const { result } = renderHook(() => useDeleteAllNotifications(), { wrapper: scenario.Wrapper })

    let pending!: Promise<unknown>
    await act(async () => {
      pending = result.current.mutateAsync()
      await settle()
    })

    respondToSessionCheckWith('account-b')
    await act(async () => {
      await announceAccountFromAnotherTab('account-b')
    })
    stopMonitor()
    scenario.seedReplacementAccount()

    await act(async () => {
      rejectAction(new Error('Late clear all failure'))
      await pending.catch(() => undefined)
    })

    const { notificationKeys } = await import('@orbit/shared/query')
    expect(scenario.queryClient.getQueryData(notificationKeys.lists()))
      .toEqual(accountBNotifications)
    scenario.expectReplacementAccountUntouched()
  })
})

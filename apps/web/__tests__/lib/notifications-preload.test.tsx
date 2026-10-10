import { cleanup, render, screen, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { NotificationsPreload } from '@/lib/notifications-preload'
import { createQueryClient } from '@/lib/query-client'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useNotifications } from '@/hooks/use-notifications'
import { invalidateAccountEvent, notificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { loadInitialNotifications } from '@/lib/server-notifications'

const mocks = vi.hoisted(() => ({ serverFetch: vi.fn(), browserFetch: vi.fn() }))
vi.mock('@/lib/server-fetch', () => ({ serverRenderFetch: mocks.serverFetch }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function NotificationCount() {
  const { unreadCount } = useNotifications()
  return <output aria-label="Unread">{unreadCount}</output>
}

it('does not reseed server notifications when a consumer remounts after an account reset', () => {
  vi.stubGlobal('fetch', mocks.browserFetch.mockReturnValue(new Promise(() => {})))
  const queryClient = createQueryClient()
  const initialNotifications = { notifications: { items: [], unreadCount: 15 }, updatedAt: Date.now() }
  const shell = (showCount: boolean) => <NotificationsPreload initialNotifications={initialNotifications}>
    <QueryClientProvider client={queryClient}>{showCount && <NotificationCount />}</QueryClientProvider>
  </NotificationsPreload>
  const tree = render(shell(true))
  expect(screen.getByRole('status', { name: 'Unread' })).toHaveTextContent('15')
  tree.rerender(shell(false))
  act(() => {
    advanceAccountGeneration()
    queryClient.clear()
  })
  tree.rerender(shell(true))
  expect(screen.getByRole('status', { name: 'Unread' })).toHaveTextContent('0')
})

it('paints a retained preload immediately and refreshes it when the first consumer mounts after it becomes stale', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', mocks.browserFetch.mockReset().mockReturnValue(new Promise(() => {})))
  mocks.serverFetch.mockResolvedValue({ items: [], unreadCount: 15 })
  const initialNotifications = await loadInitialNotifications(true)
  const queryClient = createQueryClient()
  const shell = (showCount: boolean) => <NotificationsPreload initialNotifications={initialNotifications}>
    <QueryClientProvider client={queryClient}>{showCount && <NotificationCount />}</QueryClientProvider>
  </NotificationsPreload>
  const tree = render(shell(false))
  expect(queryClient.getQueryState(notificationKeys.lists())).toBeUndefined()
  act(() => {
    invalidateAccountEvent(queryClient, {
      type: 'changes',
      payload: { v: 1, changes: [{ kind: 'notification', op: 'updated', ids: [] }], origin: null },
    }, null)
    invalidateAccountEvent(queryClient, {
      type: 'resync', payload: { v: 1, changes: [], origin: null },
    }, null)
  })
  expect(queryClient.getQueryState(notificationKeys.lists())).toBeUndefined()
  await act(async () => { await vi.advanceTimersByTimeAsync(QUERY_STALE_TIMES.notifications + 1) })
  tree.rerender(shell(true))
  expect(screen.getByRole('status', { name: 'Unread' })).toHaveTextContent('15')
  expect(mocks.browserFetch).toHaveBeenCalledTimes(1)
  expect(mocks.browserFetch).toHaveBeenCalledWith(API.notifications.list, expect.any(Object))
})

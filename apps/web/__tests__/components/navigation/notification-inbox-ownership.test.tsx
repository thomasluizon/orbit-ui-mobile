import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { fetchJson } from '@/lib/api-fetch'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications',
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: vi.fn() }))
vi.mock('@/app/actions/notifications', () => ({
  markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(), deleteAllNotifications: vi.fn(),
}))

let queryClient: QueryClient

function shell(inbox: boolean) {
  return <QueryClientProvider client={queryClient}>
    <NotificationBell />{inbox ? <NotificationInbox /> : null}
  </QueryClientProvider>
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  focusManager.setFocused(true)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const response = { items: [createMockNotification({ isRead: false })], unreadCount: 1 }
  queryClient.setQueryData(notificationKeys.lists(), response)
  vi.mocked(fetchJson).mockResolvedValue(response)
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('shares one poll between the shell bell and inbox until the last consumer unmounts', async () => {
  const interval = vi.spyOn(globalThis, 'setInterval')
  const clear = vi.spyOn(globalThis, 'clearInterval')
  const view = render(shell(false))
  await advance(1000)
  view.rerender(shell(true))
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(1)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect.soft(fetchJson).toHaveBeenCalledTimes(1)
  clear.mockClear()
  view.rerender(shell(false))
  expect.soft(clear).not.toHaveBeenCalled()
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect.soft(fetchJson).toHaveBeenCalledTimes(2)
  clear.mockClear()
  view.unmount()
  expect(clear).toHaveBeenCalledTimes(1)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(fetchJson).toHaveBeenCalledTimes(2)
})

it('clears the shared interval on focus loss and resumes one poll on focus', async () => {
  render(shell(true))
  const clear = vi.spyOn(globalThis, 'clearInterval')
  await act(async () => { focusManager.setFocused(false) })
  expect.soft(clear).toHaveBeenCalledTimes(1)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL * 2)
  expect(fetchJson).not.toHaveBeenCalled()
  const interval = vi.spyOn(globalThis, 'setInterval')
  await act(async () => { focusManager.setFocused(true) })
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(1)
  vi.mocked(fetchJson).mockClear()
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(fetchJson).toHaveBeenCalledTimes(1)
})

it('refreshes a fresh notification cache immediately on focus with both consumers attached', async () => {
  render(shell(true))
  expect(fetchJson).not.toHaveBeenCalled()
  await act(async () => { focusManager.setFocused(false) })
  expect(fetchJson).not.toHaveBeenCalled()
  await act(async () => { focusManager.setFocused(true) })
  expect(fetchJson).toHaveBeenCalledTimes(1)
})

it('does not start a poll when both consumers mount while unfocused', async () => {
  focusManager.setFocused(false)
  const interval = vi.spyOn(globalThis, 'setInterval')
  render(shell(true))
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(0)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(fetchJson).not.toHaveBeenCalled()
})

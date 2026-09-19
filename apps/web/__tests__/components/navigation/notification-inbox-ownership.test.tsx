import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { fetchJson } from '@/lib/api-fetch'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { useAuthStore } from '@/stores/auth-store'

const actionMocks = vi.hoisted(() => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}))
const feedback = vi.hoisted(() => ({ showError: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications',
}))
vi.mock('next-intl', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  return { useTranslations: () => createTranslator({ locale: 'en', messages }) }
})
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: vi.fn() }))
vi.mock('@/app/actions/notifications', () => actionMocks)
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(), error: feedback.showError, info: vi.fn(), success: vi.fn(),
  }),
}))

let queryClient: QueryClient

function shell(inbox: boolean) {
  return <QueryClientProvider client={queryClient}>
    <NotificationBell />{inbox ? <NotificationInbox /> : null}<NotificationDeleteNotice />
  </QueryClientProvider>
}

function deferredResult() {
  let resolve!: (value: { ok: false; error: string; status: number; sessionRefreshFailed: false }) => void
  const promise = new Promise<{ ok: false; error: string; status: number; sessionRefreshFailed: false }>(
    (resolvePromise) => { resolve = resolvePromise },
  )
  return { promise, reject: () => resolve({ ok: false, error: 'Server error', status: 500, sessionRefreshFailed: false }) }
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

async function flushPromises() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetPendingNotificationDeletesForTests()
  focusManager.setFocused(true)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const response = { items: [createMockNotification({ isRead: false })], unreadCount: 1 }
  queryClient.setQueryData(notificationKeys.lists(), response)
  vi.mocked(fetchJson).mockResolvedValue(response)
  const success = { ok: true as const, data: undefined }
  actionMocks.markNotificationRead.mockResolvedValue(success)
  actionMocks.markAllNotificationsRead.mockResolvedValue(success)
  actionMocks.deleteNotification.mockResolvedValue(success)
  actionMocks.deleteAllNotifications.mockResolvedValue(success)
})

afterEach(() => {
  cleanup()
  resetPendingNotificationDeletesForTests()
  queryClient.clear()
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it.each([
  ['mark one read', 'markNotificationRead', "Couldn't mark that alert read. Try again."],
  ['mark all read', 'markAllNotificationsRead', "Couldn't mark the alerts read. Try again."],
  ['clear all', 'deleteAllNotifications', "Couldn't clear the alerts. Try again."],
] as const)('announces a rejected %s action and restores the unread cache', async (_label, actionName, message) => {
  const deferred = deferredResult()
  actionMocks[actionName].mockReturnValueOnce(deferred.promise)
  render(shell(true))

  if (actionName === 'markNotificationRead') {
    fireEvent.click(screen.getByRole('button', { name: /unread/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark read' }))
  } else if (actionName === 'markAllNotificationsRead') {
    fireEvent.click(screen.getByRole('button', { name: 'Mark all' }))
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
  }

  deferred.reject()
  await flushPromises()
  expect(feedback.showError).toHaveBeenCalledWith(message, { duration: 5000 })
  expect(queryClient.getQueryData<{ unreadCount: number }>(notificationKeys.lists())?.unreadCount).toBe(1)
})

it('announces a delayed delete rejection after the inbox unmounts and keeps undo silent', async () => {
  const deferred = deferredResult()
  actionMocks.deleteNotification.mockReturnValueOnce(deferred.promise)
  const view = render(shell(true))

  fireEvent.click(screen.getByRole('button', { name: /Delete:/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await advance(5000)
  expect(actionMocks.deleteNotification).not.toHaveBeenCalled()
  expect(feedback.showError).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: /Delete:/ }))
  await advance(5000)
  view.rerender(shell(false))
  deferred.reject()

  await flushPromises()
  await advance(0)
  expect(screen.getByText("Couldn't delete that alert. Try again.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  expect(feedback.showError).not.toHaveBeenCalled()
  expect(queryClient.getQueryData<{ unreadCount: number }>(notificationKeys.lists())?.unreadCount).toBe(1)
})

it('runs out the delayed delete failure and holds it while the pointer rests on it', async () => {
  const deferred = deferredResult()
  actionMocks.deleteNotification.mockReturnValueOnce(deferred.promise)
  render(shell(true))

  fireEvent.click(screen.getByRole('button', { name: /Delete:/ }))
  await advance(5000)
  deferred.reject()
  await flushPromises()
  await advance(0)
  const notice = screen.getByText("Couldn't delete that alert. Try again.").closest('[role="status"]')
  if (!notice) throw new Error('Expected the failed delete notice')

  fireEvent.pointerEnter(notice)
  await advance(30000)
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

  fireEvent.pointerLeave(notice)
  await advance(10000)

  expect(screen.queryByText("Couldn't delete that alert. Try again.")).not.toBeInTheDocument()
})

function respondWithAccount(userId: string) {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId, refreshFailed: false }),
  } as unknown as Response)
}

async function openDetailForUnreadNotification() {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(shell(true))
  fireEvent.click(screen.getByRole('button', { name: /unread/ }))
  expect(within(screen.getByRole('dialog')).getByText('Time to complete your habit!')).toBeInTheDocument()
}

it('takes the replaced account notification off the screen instead of holding it open', async () => {
  vi.stubGlobal('fetch', vi.fn())
  await openDetailForUnreadNotification()

  respondWithAccount('user-2')
  await act(async () => { await useAuthStore.getState().checkSession() })

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  respondWithAccount('user-3')
  await act(async () => { await useAuthStore.getState().checkSession() })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(actionMocks.markNotificationRead).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

it('keeps the open notification when the same account recovers from a rejected refresh', async () => {
  vi.stubGlobal('fetch', vi.fn())
  await openDetailForUnreadNotification()

  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false, status: 401, json: () => Promise.resolve({ refreshFailed: true }),
  } as unknown as Response)
  await act(async () => { await useAuthStore.getState().confirmSessionRefreshFailure() })
  respondWithAccount('user-1')
  await act(async () => { await useAuthStore.getState().recoverSessionRefreshFailure() })

  expect(within(screen.getByRole('dialog')).getByText('Time to complete your habit!')).toBeInTheDocument()
  vi.unstubAllGlobals()
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

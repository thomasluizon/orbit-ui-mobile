import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppState, type AppStateStatus } from 'react-native'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { apiClient } from '@/lib/api-client'
import { getFailedNotificationDeleteIdsSnapshot, resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { useAppToastStore } from '@/stores/app-toast-store'
import { i18n } from '@/lib/i18n'

const TestRenderer = require('react-test-renderer')
const translation = vi.hoisted(() => ({
  t: (key: string, _values?: Record<string, unknown>) => key,
}))
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: translation.t }) }
})

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications',
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native')
  return { SafeAreaView: View }
})
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
const offlineMocks = vi.hoisted(() => ({
  buildQueuedMutation: vi.fn((options) => ({ id: 'mutation-1', ...options })),
  createQueuedAck: vi.fn((id: string) => ({ queued: true, queuedMutationId: id })),
  isQueuedResult: vi.fn(() => false),
  queueOrExecute: vi.fn(({ execute }: { execute: () => Promise<unknown> }) => execute()),
}))
vi.mock('@/lib/offline-mutations', () => offlineMocks)
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))

let tree: { unmount: () => void; update: (element: React.ReactElement) => void } | undefined
let queryClient: QueryClient
const listeners = new Set<(status: AppStateStatus) => void>()

function retainedStack(inbox: boolean) {
  return <QueryClientProvider client={queryClient}>
    <NotificationBell />{inbox ? <NotificationInbox /> : null}<NotificationDeleteNotice />
  </QueryClientProvider>
}

function deferredFailure() {
  let reject!: (error: Error) => void
  const promise = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise })
  return { promise, reject: () => reject(new Error('Server error')) }
}

function press(label: string) {
  const button = (tree as unknown as { root: { findAll: (predicate: (node: { type: unknown; props: Record<string, unknown>; findAll: (predicate: (child: { type: unknown; props: Record<string, unknown> }) => boolean) => unknown[] }) => boolean) => { props: { onPress?: () => void } }[] } }).root.findAll(
    (node) => typeof node.props.onPress === 'function' && (
      node.props.accessibilityLabel === label
      || node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0
    ),
  )[0]
  expect(button, label).toBeDefined()
  TestRenderer.act(() => button?.props.onPress?.())
}

function pressStarting(prefix: string) {
  const button = (tree as unknown as { root: { findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => { props: { accessibilityLabel?: string; onPress?: () => void } }[] } }).root.findAll(
    (node) => typeof node.props.onPress === 'function'
      && typeof node.props.accessibilityLabel === 'string'
      && node.props.accessibilityLabel.startsWith(prefix),
  )[0]
  expect(button, prefix).toBeDefined()
  TestRenderer.act(() => button?.props.onPress?.())
}

async function advance(milliseconds: number) {
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetPendingNotificationDeletesForTests()
  useAppToastStore.setState({ currentToast: null, queue: [] })
  await i18n.changeLanguage('en')
  translation.t = i18n.t.bind(i18n)
  focusManager.setFocused(true)
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener)
    return { remove: () => { listeners.delete(listener) } }
  })
  await import('@/lib/query-client')
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const response = { items: [createMockNotification({ isRead: false })], unreadCount: 1 }
  queryClient.setQueryData(notificationKeys.lists(), response)
  vi.mocked(apiClient).mockResolvedValue(response)
  offlineMocks.queueOrExecute.mockImplementation(({ execute }: { execute: () => Promise<unknown> }) => execute())
})

afterEach(() => {
  TestRenderer.act(() => tree?.unmount())
  tree = undefined
  resetPendingNotificationDeletesForTests()
  useAppToastStore.setState({ currentToast: null, queue: [] })
  queryClient.clear()
  listeners.clear()
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it.each([
  ['mark one read', 'Mark read', "Couldn't mark that alert read. Try again."],
  ['mark all read', 'Mark all', "Couldn't mark the alerts read. Try again."],
  ['clear all', 'Clear all', "Couldn't clear the alerts. Try again."],
] as const)('announces a rejected %s action and restores the unread cache', async (_name, label, message) => {
  const deferred = deferredFailure()
  const response = queryClient.getQueryData(notificationKeys.lists())
  vi.mocked(apiClient).mockImplementation((_path, options) => (
    options?.method ? deferred.promise : Promise.resolve(response)
  ))
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })

  if (label === 'Mark read') {
    pressStarting('Reminder.')
    press(label)
  } else if (label === 'Clear all') {
    press(label)
    press('Delete')
  } else {
    press(label)
  }

  deferred.reject()
  await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(useAppToastStore.getState().currentToast?.toast.message).toBe(message)
  expect(queryClient.getQueryData<{ unreadCount: number }>(notificationKeys.lists())?.unreadCount).toBe(1)
})

it('keeps an undone delayed delete silent', async () => {
  const response = queryClient.getQueryData(notificationKeys.lists())
  vi.mocked(apiClient).mockResolvedValue(response)
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })

  press('Delete: Reminder')
  press('Undo')
  await advance(5000)
  expect(useAppToastStore.getState().currentToast).toBeNull()
})

it('runs out the delayed delete failure and holds it while a pointer rests on it', async () => {
  const deferred = deferredFailure()
  const response = queryClient.getQueryData(notificationKeys.lists())
  vi.mocked(apiClient).mockImplementation((_path, options) => (
    options?.method ? deferred.promise : Promise.resolve(response)
  ))
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })

  press('Delete: Reminder')
  await advance(5000)
  deferred.reject()
  await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(getFailedNotificationDeleteIdsSnapshot()).toHaveLength(1)
  const notice = (tree as unknown as { root: { findByProps: (props: Record<string, unknown>) => { props: { onHoverIn: () => void; onHoverOut: () => void } } } }).root.findByProps({ testID: 'toast-neutral' })

  TestRenderer.act(() => notice.props.onHoverIn())
  await advance(30000)
  expect(getFailedNotificationDeleteIdsSnapshot()).toHaveLength(1)

  TestRenderer.act(() => notice.props.onHoverOut())
  await advance(10000)

  expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
})

it('shares one poll and the app AppState bridge between the retained bell and pushed inbox until the last unmount', async () => {
  const interval = vi.spyOn(globalThis, 'setInterval')
  const clear = vi.spyOn(globalThis, 'clearInterval')
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(false)) })
  await advance(1000)
  TestRenderer.act(() => tree?.update(retainedStack(true)))
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(1)
  expect.soft(listeners.size).toBe(1)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect.soft(apiClient).toHaveBeenCalledTimes(1)
  TestRenderer.act(() => tree?.update(retainedStack(false)))
  expect.soft(clear).not.toHaveBeenCalled()
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect.soft(apiClient).toHaveBeenCalledTimes(2)
  TestRenderer.act(() => tree?.unmount())
  tree = undefined
  expect.soft(clear).toHaveBeenCalledTimes(1)
  expect(listeners.size).toBe(0)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(apiClient).toHaveBeenCalledTimes(2)
})

it('pauses both retained consumers through the app focus bridge and resumes one poll on foreground', async () => {
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })
  expect.soft(listeners.size).toBe(1)
  await TestRenderer.act(() => { listeners.forEach((listener) => listener('background')) })
  await advance(NOTIFICATIONS_REFETCH_INTERVAL * 2)
  expect(apiClient).not.toHaveBeenCalled()
  const interval = vi.spyOn(globalThis, 'setInterval')
  await TestRenderer.act(() => { listeners.forEach((listener) => listener('active')) })
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(1)
  vi.mocked(apiClient).mockClear()
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(apiClient).toHaveBeenCalledTimes(1)
})

it('refreshes a fresh notification cache immediately when Android returns active with both consumers attached', async () => {
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })
  expect(apiClient).not.toHaveBeenCalled()
  await TestRenderer.act(() => { listeners.forEach((listener) => listener('background')) })
  expect(apiClient).not.toHaveBeenCalled()
  await TestRenderer.act(() => { listeners.forEach((listener) => listener('active')) })
  expect(apiClient).toHaveBeenCalledTimes(1)
})

it('does not start a poll when the retained consumers mount while unfocused', async () => {
  focusManager.setFocused(false)
  const interval = vi.spyOn(globalThis, 'setInterval')
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(0)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(apiClient).not.toHaveBeenCalled()
})

import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppState, type AppStateStatus } from 'react-native'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { apiClient } from '@/lib/api-client'

const TestRenderer = require('react-test-renderer')

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications',
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native')
  return { SafeAreaView: View }
})
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn(), createQueuedAck: vi.fn(), isQueuedResult: vi.fn(), queueOrExecute: vi.fn(),
}))
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))

let tree: { unmount: () => void; update: (element: React.ReactElement) => void } | undefined
let queryClient: QueryClient
const listeners = new Set<(status: AppStateStatus) => void>()

function retainedStack(inbox: boolean) {
  return <QueryClientProvider client={queryClient}>
    <NotificationBell />{inbox ? <NotificationInbox /> : null}
  </QueryClientProvider>
}

async function advance(milliseconds: number) {
  await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.clearAllMocks()
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
})

afterEach(() => {
  TestRenderer.act(() => tree?.unmount())
  tree = undefined
  queryClient.clear()
  listeners.clear()
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
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

it('does not start a poll when the retained consumers mount while unfocused', async () => {
  focusManager.setFocused(false)
  const interval = vi.spyOn(globalThis, 'setInterval')
  TestRenderer.act(() => { tree = TestRenderer.create(retainedStack(true)) })
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(0)
  await advance(NOTIFICATIONS_REFETCH_INTERVAL)
  expect(apiClient).not.toHaveBeenCalled()
})

import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppState } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NOTIFICATIONS_REFETCH_INTERVAL, notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationInbox } from '@/components/navigation/notification-inbox'

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

let tree: { unmount: () => void } | undefined
let queryClient: QueryClient

beforeEach(() => {
  vi.useFakeTimers()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  queryClient.setQueryData(notificationKeys.lists(), {
    items: [createMockNotification({ isRead: false })], unreadCount: 1,
  })
})

afterEach(() => {
  TestRenderer.act(() => tree?.unmount())
  tree = undefined
  queryClient.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('owns one poll timer and one AppState listener for the inbox lifetime', () => {
  const interval = vi.spyOn(globalThis, 'setInterval')
  const clearInterval = vi.spyOn(globalThis, 'clearInterval')
  const remove = vi.fn()
  const subscribe = vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove })
  TestRenderer.act(() => {
    tree = TestRenderer.create(<QueryClientProvider client={queryClient}><NotificationInbox /></QueryClientProvider>)
  })
  expect.soft(interval.mock.calls.filter(([, delay]) => delay === NOTIFICATIONS_REFETCH_INTERVAL)).toHaveLength(1)
  expect.soft(subscribe.mock.calls.filter(([event]) => event === 'change')).toHaveLength(1)
  TestRenderer.act(() => tree?.unmount())
  tree = undefined
  expect(clearInterval).toHaveBeenCalledTimes(1)
  expect(remove).toHaveBeenCalledTimes(1)
})

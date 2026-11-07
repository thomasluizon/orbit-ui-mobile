import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { Shell412 } from '@/components/shell/shell-412'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const inbox: { state: 'empty' | 'error' } = vi.hoisted(() => ({ state: 'empty' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: (await import('react-native')).View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-notifications', () => ({
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutateAsync: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({
  notifications: [], visibleNotifications: [], visibleUnreadCount: 0,
  isLoading: false, isError: inbox.state === 'error', pendingDeleteIds: [], refetch: vi.fn(),
}) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications' }))

const HEIGHT = 915
let tree: GeometryTree
afterEach(async () => { await act(() => tree.unmount()) })

it.each([
  ...[360, 412, 840].map(width => ({ width, state: 'empty' as const })),
  { width: 412, state: 'error' as const },
])('centres the Avisos $state group between the header and the tab bar at $width px', async ({ width, state }) => {
  inbox.state = state
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<Shell412 safeAreaTop={false} notice={<></>} tabBar={<View testID="tab-bar" style={{ height: 80 }} />}>
    <NotificationInbox />
  </Shell412>) as GeometryTree })
  const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, { width, height: HEIGHT })
  const free = { top: boxes.get('notification-scroller')!.top, bottom: boxes.get('tab-bar')!.top }
  const group = boxes.get('notification-empty')!
  expect(free.bottom - free.top).toBeGreaterThan(group.bottom - group.top)
  expect(Math.abs((group.top + group.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
})

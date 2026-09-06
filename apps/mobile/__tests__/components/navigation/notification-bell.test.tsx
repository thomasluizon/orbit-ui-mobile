import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import type { NotificationItem } from '@orbit/shared/types/notification'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { NotificationDetailModal } from '@/components/navigation/notification-detail-modal'
import { resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')
const state = vi.hoisted(() => ({
  notifications: [] as NotificationItem[], unreadCount: 0, isLoading: false, isError: false,
  locale: 'en', mode: 'dark', push: vi.fn(), back: vi.fn(), refetch: vi.fn(), mark: vi.fn(), markAll: vi.fn(),
  remove: vi.fn(), clear: vi.fn(),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), usePathname: () => '/' }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => state.back }))
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native')
  return { SafeAreaView: View }
})
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: state.mode }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const messages = state.locale === 'en' ? en : pt
      const [namespace, name = ''] = key.split('.')
      const group = messages[namespace as keyof typeof messages]
      const value = typeof group === 'object' ? Reflect.get(group, name) as unknown : undefined
      return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, token: string) => String(values?.[token])) : key
    },
  }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ ...state }),
  useMarkNotificationRead: () => ({ mutate: state.mark }),
  useMarkAllNotificationsRead: () => ({ mutate: state.markAll }),
  useDeleteNotification: () => ({ mutate: state.remove }),
  useDeleteAllNotifications: () => ({ mutate: state.clear }),
}))
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))

type Node = {
  type: unknown
  props: { accessibilityLabel?: string; testID?: string; children?: unknown; style?: unknown; onPress?: () => void; accessibilityState?: { busy?: boolean } }
  parent: Node | null
  findAll: (predicate: (node: Node) => boolean) => Node[]
}
type Tree = { root: Node; update: (element: React.ReactNode) => void; unmount: () => void }
let trees: Tree[] = []
function render(element: React.ReactNode = <><NotificationInbox /><NotificationDeleteNotice /></>): Tree {
  let tree: Tree
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  trees.push(tree!)
  return tree!
}
function hosts(tree: Tree, type: string, label?: string) {
  return tree.root.findAll((node) => node.type === type && (label === undefined || node.props.accessibilityLabel === label))
}
function press(tree: Tree, label: string) {
  const button = hosts(tree, 'Pressable', label)[0] ?? hosts(tree, 'Pressable').find(
    (node) => node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0,
  )
  expect(button, label).toBeDefined()
  TestRenderer.act(() => button!.props.onPress?.())
}
function text(tree: Tree, value: string) {
  return hosts(tree, 'Text').filter((node) => node.props.children === value)
}
function testId(tree: Tree, id: string) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === id)
}
function refresh(tree: Tree) {
  TestRenderer.act(() => tree.update(<><NotificationInbox /><NotificationDeleteNotice /></>))
}
function seed(count: number) {
  state.notifications = Array.from({ length: count }, (_, index) => createMockNotification({
    id: String(index), title: `Alert ${index}`, url: '/progress', isRead: false,
  }))
  state.unreadCount = count
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetPendingNotificationDeletesForTests()
  Object.assign(state, { notifications: [], unreadCount: 0, isLoading: false, isError: false, locale: 'en', mode: 'dark' })
  state.mark.mockImplementation((id: string) => {
    state.notifications = state.notifications.map((item) => item.id === id ? { ...item, isRead: true } : item)
    state.unreadCount -= 1
  })
  state.markAll.mockImplementation(() => {
    state.notifications = state.notifications.map((item) => ({ ...item, isRead: true }))
    state.unreadCount = 0
  })
  state.remove.mockImplementation((id: string) => {
    state.notifications = state.notifications.filter((item) => item.id !== id)
    state.unreadCount -= 1
  })
  state.clear.mockImplementation(() => { state.notifications = []; state.unreadCount = 0 })
})
afterEach(() => {
  TestRenderer.act(() => trees.forEach((tree) => tree.unmount()))
  trees = []
  resetPendingNotificationDeletesForTests()
  vi.useRealTimers()
})

describe('mobile alerts', () => {
  it('pushes the inbox and keeps zero absent', () => {
    const tree = render(<NotificationBell />)
    press(tree, 'Alerts')
    expect(state.push).toHaveBeenCalledWith('/notifications')
    expect(testId(tree, 'notification-count')).toHaveLength(0)
  })
  it.each(['dark', 'light'] as const)('keeps a neutral capped count while loading in %s', (mode) => {
    state.mode = mode
    state.unreadCount = 25
    state.isLoading = true
    const tree = render(<NotificationBell />)
    const badge = testId(tree, 'notification-count')[0]!
    expect(badge.props.children).toBe('9+')
    const tokens = createTokensV2('purple', mode)
    expect(StyleSheet.flatten(badge.props.style)).toMatchObject({ backgroundColor: tokens.fg1, color: tokens.bg, minWidth: 20, height: 20 })
    expect(hosts(tree, 'Pressable', 'Alerts, 25 unread')).toHaveLength(1)
  })
  it.each([1, 9])('shows the count %s below the cap', (count) => {
    state.unreadCount = count
    expect(testId(render(<NotificationBell />), 'notification-count')[0]!.props.children).toBe(count)
  })
  it('renders an empty inbox without an action and a visible back affordance', () => {
    const tree = render()
    expect(text(tree, 'Nothing to see here')).toHaveLength(1)
    expect(hosts(tree, 'Pressable', 'Clear all')).toHaveLength(0)
    expect(hosts(tree, 'Pressable', 'Mark all read')).toHaveLength(0)
    press(tree, en.common.back)
    expect(state.back).toHaveBeenCalledWith('/')
  })
  it('reserves three skeleton lines per row and exposes busy state', () => {
    state.isLoading = true
    const tree = render()
    expect(testId(tree, 'notification-skeleton-line')).toHaveLength(15)
    expect(hosts(tree, 'View', 'Alerts')[0]!.props.accessibilityState).toEqual({ busy: true })
    expect(text(tree, 'Nothing to see here')).toHaveLength(0)
  })
  it('offers retry on a load failure', () => {
    state.isError = true
    const tree = render()
    expect(text(tree, en.notifications.loadError)).toHaveLength(1)
    press(tree, en.common.retry)
    expect(state.refetch).toHaveBeenCalledOnce()
  })
  it.each([1, 50])('renders all %s returned items', (count) => {
    seed(count)
    expect(testId(render(), 'notification-unread')).toHaveLength(count)
  })
  it('retains unread until marked and distinguishes it without colour', () => {
    seed(1)
    const tree = render()
    expect(testId(tree, 'notification-unread-dot')).toHaveLength(1)
    expect(StyleSheet.flatten(testId(tree, 'notification-title')[0]!.props.style)).toMatchObject({ fontFamily: 'Geist_500Medium' })
    press(tree, 'Alert 0. unread')
    expect(state.mark).not.toHaveBeenCalled()
    press(tree, 'Mark as read')
    refresh(tree)
    expect(testId(tree, 'notification-unread-dot')).toHaveLength(0)
    expect(testId(tree, 'notification-dot-column')).toHaveLength(1)
    expect(StyleSheet.flatten(testId(tree, 'notification-title')[0]!.props.style)).toMatchObject({ fontFamily: 'Geist_400Regular' })
    expect(hosts(tree, 'Pressable', 'Mark as read')).toHaveLength(0)
  })
  it('marks all read and removes only the mark action', () => {
    seed(2)
    const tree = render()
    press(tree, 'Mark all read')
    refresh(tree)
    expect(hosts(tree, 'Pressable', 'Mark all read')).toHaveLength(0)
    expect(testId(tree, 'notification-read')).toHaveLength(2)
    expect(hosts(tree, 'Pressable', 'Clear all')).toHaveLength(1)
  })
  it('keeps delete outside the row body, restores on undo and dismisses on commit', () => {
    seed(2)
    const tree = render()
    const body = hosts(tree, 'Pressable', 'Alert 0. unread')[0]!
    expect(body.findAll((node) => node.props.accessibilityLabel === 'Delete: Alert 0')).toHaveLength(0)
    press(tree, 'Delete: Alert 0')
    expect(hosts(tree, 'Pressable', 'Alert 0. unread')).toHaveLength(0)
    expect(state.remove).not.toHaveBeenCalled()
    TestRenderer.act(() => vi.advanceTimersByTime(4000))
    press(tree, 'Undo')
    expect(hosts(tree, 'Pressable', 'Alert 0. unread')).toHaveLength(1)
    expect(hosts(tree, 'Pressable', 'Undo')).toHaveLength(0)
    TestRenderer.act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
    press(tree, 'Delete: Alert 0')
    TestRenderer.act(() => vi.advanceTimersByTime(5000))
    expect(hosts(tree, 'Pressable', 'Undo')).toHaveLength(0)
    expect(hosts(tree, 'Pressable', 'Alert 0. unread')).toHaveLength(0)
    expect(state.remove).toHaveBeenCalledOnce()
  })
  it.each(['en', 'pt-BR'])('confirms the count and irreversible clear in %s', (locale) => {
    state.locale = locale
    seed(2)
    const messages = locale === 'en' ? en : pt
    const tree = render()
    press(tree, messages.notifications.deleteAll)
    expect(text(tree, messages.notifications.deleteAllConfirmDescription.replace('{count}', '2'))).toHaveLength(1)
    expect(state.clear).not.toHaveBeenCalled()
    press(tree, messages.common.cancel)
    expect(testId(tree, 'notification-unread')).toHaveLength(2)
    press(tree, messages.notifications.deleteNotification.replace('{title}', 'Alert 0'))
    press(tree, messages.notifications.deleteAll)
    press(tree, messages.notifications.delete)
    refresh(tree)
    expect(text(tree, messages.notifications.empty)).toHaveLength(1)
    expect(hosts(tree, 'Pressable', messages.notifications.deleteUndo)).toHaveLength(0)
    TestRenderer.act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
  })
  it('navigates from detail to the target after closing', () => {
    const tree = render(<NotificationDetailModal open notification={createMockNotification({ url: '/streak' })}
      onClose={vi.fn()} onMarkAsRead={vi.fn()} onDelete={vi.fn()} />)
    const label = en.notifications.openIn.replace('{target}', en.nav.progress)
    const target = hosts(tree, 'Pressable').find((node) => node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0)!
    TestRenderer.act(() => target.props.onPress?.())
    expect(state.push).toHaveBeenCalledWith('/progress')
  })
})

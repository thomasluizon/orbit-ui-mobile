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
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')
const state = vi.hoisted(() => ({
  notifications: [] as NotificationItem[], unreadCount: 0, isLoading: false, isError: false,
  locale: 'en', mode: 'dark', pathname: '/', push: vi.fn(), back: vi.fn(), refetch: vi.fn(), mark: vi.fn(), markAll: vi.fn(),
  remove: vi.fn(), clear: vi.fn(),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), usePathname: () => state.pathname }))
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
  props: { accessibilityLabel?: string; accessibilityRole?: string; accessible?: boolean; testID?: string; children?: unknown; style?: unknown; size?: number; color?: string; onFocus?: () => void; onBlur?: () => void; onPress?: () => void; accessibilityState?: { busy?: boolean } }
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
  useUIStore.setState({ astraConversationOpen: false })
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetPendingNotificationDeletesForTests()
  Object.assign(state, { notifications: [], unreadCount: 0, isLoading: false, isError: false, locale: 'en', mode: 'dark', pathname: '/' })
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

function contrastOnSurface(foreground: string, layers: string[]): number {
  const channels = (color: string) => color.startsWith('#')
    ? [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
    : color.match(/[\d.]+/g)!.map(Number)
  const background = layers.reduce((below, layer) => {
    const [red, green, blue, alpha = 1] = channels(layer)
    return [red!, green!, blue!].map((value, index) => Math.round(value * alpha + below[index]! * (1 - alpha)))
  }, [0, 0, 0])
  const luminance = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, value, index) => {
    const normalized = value / 255
    const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][index]!
  }, 0)
  const front = luminance(channels(foreground))
  const back = luminance(background)
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
}

describe('mobile alerts', () => {
  it.each(['dark', 'light'].flatMap((mode) =>
    ['row body', 'row timestamp', 'row target', 'detail body', 'detail metadata'].map((field) => ({ mode, field })),
  ))('resolves rendered $field to fg2 in $mode', ({ mode, field }) => {
    state.mode = mode
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    state.notifications = [createMockNotification({ title: 'Reminder', body: 'Time for a walk',
      url: '/calendar', isRead: false, createdAtUtc: '2026-09-06T11:55:00Z' })]
    const tree = render()
    const labels = { 'row body': 'Time for a walk', 'row timestamp': '5 min ago', 'row target': 'Calendar',
      'detail body': 'Time for a walk', 'detail metadata': '5 min ago · Calendar' }
    if (field.startsWith('detail')) press(tree, 'Reminder. unread. Calendar')
    const matches = hosts(tree, 'Text').filter((node) =>
      React.Children.toArray(node.props.children as React.ReactNode)
        .filter((child) => typeof child === 'string' || typeof child === 'number').join('') === labels[field as keyof typeof labels],
    )
    const element = field.startsWith('detail') ? matches.at(-1)! : matches[0]!
    const foreground = (StyleSheet.flatten(element.props.style) as { color: string }).color
    const tokens = createTokensV2('purple', mode as 'dark' | 'light')
    expect(foreground, field).toBe(tokens.fg2)
    const surfaces = field.startsWith('detail') ? [[tokens.bgSheet]]
      : [[tokens.bg], [tokens.bg, tokens.bgCard], [tokens.bg, tokens.bgCard, tokens.bgHover]]
    for (const layers of surfaces) expect(contrastOnSurface(foreground, layers)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['dark', 'light'] as const)('shows retry press feedback and restores its resting surface on release in %s', (mode) => {
    state.mode = mode
    state.isError = true
    const tree = render()
    expect(text(tree, en.notifications.loadError)).toHaveLength(1)
    const retry = hosts(tree, 'Pressable', en.common.retry)[0]!
    const surface = (pressed: boolean) => {
      const style = retry.props.style
      return StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style).backgroundColor
    }
    const resting = surface(false)
    const pressed = surface(true)
    expect(pressed, 'Retry must visibly change its surface while pressed').not.toBe(resting)
    const tokens = createTokensV2('purple', mode)
    const label = retry.findAll((node) => node.type === 'Text' && node.props.children === en.common.retry)[0]!
    const { color: foreground } = StyleSheet.flatten(label.props.style) as { color: string }
    expect(contrastOnSurface(foreground, [tokens.bg, pressed])).toBeGreaterThanOrEqual(4.5)
    expect(surface(false), 'Retry must restore its resting surface after release').toBe(resting)
  })

  it.each(['dark', 'light'] as const)('shows an inset focus indicator until the row loses focus in %s', (mode) => {
    state.mode = mode
    seed(1)
    const tree = render()
    const row = () => hosts(tree, 'Pressable', 'Alert 0. unread. Progress')[0]!
    const rowStyle = (pressed = false) => {
      const style = row().props.style
      return StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style)
    }
    expect(rowStyle().outlineWidth).toBeUndefined()
    TestRenderer.act(() => row().props.onFocus?.())
    const tokens = createTokensV2('purple', mode)
    expect(rowStyle().outlineColor, 'Focus must retain the accent semantic').toBe(tokens.primary)
    expect(rowStyle()).toMatchObject({
      outlineWidth: 2, outlineOffset: -3, outlineStyle: 'solid',
      boxShadow: `inset 0 0 0 4px ${tokens.fg1}`,
    })
    const companion = (rowStyle().boxShadow as string).split(' ').at(-1)!
    expect(contrastOnSurface(rowStyle().outlineColor, [companion])).toBeGreaterThanOrEqual(3)
    expect(contrastOnSurface(companion, [tokens.bg])).toBeGreaterThanOrEqual(3)
    for (const pressed of [false, true]) {
      const focusedStyle = rowStyle(pressed)
      const layers = [tokens.bg, tokens.bgCard]
      if (focusedStyle.backgroundColor) layers.push(focusedStyle.backgroundColor)
      expect.soft(contrastOnSurface(companion, layers)).toBeGreaterThanOrEqual(3)
    }
    TestRenderer.act(() => row().props.onBlur?.())
    expect(rowStyle().outlineWidth).toBeUndefined()
    expect(rowStyle().boxShadow).toBeUndefined()
  })

  it.each([
    ['/', null, 'Home'], ['/calendar-sync', null, 'Calendar'], ['/streak', null, 'ChartLine'],
    ['/profile', null, 'User'], ['/', 'a12b34cd-1234-4567-89ab-123456789abc', 'CircleDot'],
  ] as const)('shows the destination glyph at 16px for %s with habit %s', (url, habitId, glyph) => {
    state.notifications = [createMockNotification({ title: 'Reminder', url, habitId, isRead: false })]
    const tree = render()
    const row = hosts(tree, 'Pressable').find((node) => node.props.accessibilityLabel?.startsWith('Reminder. unread.'))!
    const icons = row.findAll((node) => node.type === glyph)
    expect(icons).toHaveLength(1)
    expect(icons[0]!.props).toMatchObject({ size: 16, color: createTokensV2('purple', 'dark').fg4 })
  })

  it('uses canonical ghost list and read actions and a destructive detail delete', () => {
    seed(1)
    const tree = render()
    const action = (label: string) => hosts(tree, 'Pressable').find(
      (node) => node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0,
    )!
    for (const label of ['Mark all read', 'Clear all']) {
      expect(action(label).props.testID).toBe('button-ghost-sm')
    }
    press(tree, 'Alert 0. unread. Progress')
    expect(action('Mark as read').props.testID).toBe('button-ghost-sm')
    expect(action('Delete').props.testID).toBe('button-destructive-sm')
  })

  it('identifies the queued delete with a neutral trash glyph beside undo', () => {
    seed(1)
    const tree = render()
    press(tree, 'Delete: Alert 0')
    const notice = testId(tree, 'toast-neutral')[0]!
    const icons = notice.findAll((node) => node.type === 'Trash2')
    expect(icons).toHaveLength(1)
    expect(icons[0]!.props).toMatchObject({ size: 20, color: createTokensV2('purple', 'dark').fg2 })
    expect(hosts(tree, 'Pressable', 'Undo')).toHaveLength(1)
  })
  it.each(['en', 'pt-BR'])('keeps the inbox header count passive and updates it from inbox state in %s', (locale) => {
    state.locale = locale
    state.pathname = '/notifications'
    seed(2)
    const messages = locale === 'en' ? en : pt
    const tree = render()
    const expectCount = (count: number) => {
      const label = messages.notifications.bellWithCount.replace('{count}', String(count))
      expect(hosts(tree, 'Pressable', label)).toHaveLength(0)
      const indicator = hosts(tree, 'View', label)[0]!
      expect(indicator.props).toMatchObject({ accessible: true, accessibilityRole: 'image' })
      expect(indicator.props.onPress).toBeUndefined()
      expect(testId(tree, 'notification-count')[0]!.props.children).toBe(count)
    }
    expectCount(2)
    press(tree, messages.notifications.deleteNotification.replace('{title}', 'Alert 0'))
    expectCount(1)
    press(tree, messages.notifications.deleteUndo)
    expectCount(2)
    state.unreadCount = 4
    refresh(tree)
    expectCount(4)
    press(tree, messages.notifications.markAllRead)
    refresh(tree)
    expect(testId(tree, 'notification-count')).toHaveLength(0)
    expect(hosts(tree, 'View', messages.notifications.bell)[0]!.props.accessibilityRole).toBe('image')
    expect(hosts(tree, 'Pressable', messages.notifications.bell)).toHaveLength(0)
  })
  it('renders the standalone bell passively on the current inbox route', () => {
    state.pathname = '/notifications'
    const tree = render(<NotificationBell />)
    expect(hosts(tree, 'Pressable', 'Alerts')).toHaveLength(0)
    expect(hosts(tree, 'View', 'Alerts')[0]!.props.accessibilityRole).toBe('image')
  })
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
    const list = hosts(tree, 'View', 'Alerts').find((node) => node.findAll((child) => child.props.testID === 'notification-skeleton-line').length > 0)
    expect(list!.props.accessibilityState).toEqual({ busy: true })
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
    press(tree, 'Alert 0. unread. Progress')
    expect(state.mark).not.toHaveBeenCalled()
    press(tree, 'Mark as read')
    refresh(tree)
    expect(testId(tree, 'notification-unread-dot')).toHaveLength(0)
    expect(testId(tree, 'notification-dot-column')).toHaveLength(1)
    expect(StyleSheet.flatten(testId(tree, 'notification-title')[0]!.props.style)).toMatchObject({ fontFamily: 'Geist_400Regular' })
    expect(hosts(tree, 'Pressable', 'Mark as read')).toHaveLength(0)
  })
  it.each(['en', 'pt-BR'])('announces the title, read state and habit destination in %s', (locale) => {
    state.locale = locale
    const messages = locale === 'en' ? en : pt
    state.notifications = [createMockNotification({ title: 'Reminder', url: '/', habitId: 'a12b34cd-1234-4567-89ab-123456789abc', isRead: false })]
    state.unreadCount = 1
    const tree = render()
    expect(hosts(tree, 'Pressable', `Reminder. ${messages.notifications.unread}. ${messages.notifications.habit}`)).toHaveLength(1)
    state.notifications[0] = { ...state.notifications[0]!, isRead: true }
    refresh(tree)
    expect(hosts(tree, 'Pressable', `Reminder. ${messages.notifications.read}. ${messages.notifications.habit}`)).toHaveLength(1)
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
    const body = hosts(tree, 'Pressable', 'Alert 0. unread. Progress')[0]!
    expect(body.findAll((node) => node.props.accessibilityLabel === 'Delete: Alert 0')).toHaveLength(0)
    press(tree, 'Delete: Alert 0')
    expect(hosts(tree, 'Pressable', 'Alert 0. unread. Progress')).toHaveLength(0)
    expect(state.remove).not.toHaveBeenCalled()
    TestRenderer.act(() => vi.advanceTimersByTime(4000))
    press(tree, 'Undo')
    expect(hosts(tree, 'Pressable', 'Alert 0. unread. Progress')).toHaveLength(1)
    expect(hosts(tree, 'Pressable', 'Undo')).toHaveLength(0)
    TestRenderer.act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
    press(tree, 'Delete: Alert 0')
    TestRenderer.act(() => vi.advanceTimersByTime(5000))
    expect(hosts(tree, 'Pressable', 'Undo')).toHaveLength(0)
    expect(hosts(tree, 'Pressable', 'Alert 0. unread. Progress')).toHaveLength(0)
    expect(state.remove).toHaveBeenCalledOnce()
  })
  it.each(['en', 'pt-BR'])('confirms the full scope and irreversible clear in %s', (locale) => {
    state.locale = locale
    seed(50)
    const messages = locale === 'en' ? en : pt
    const tree = render()
    press(tree, messages.notifications.deleteAll)
    expect(text(tree, locale === 'en' ? 'All alerts leave the list. There is no way to undo this.' : 'Todos os avisos saem da lista. Não há como desfazer.')).toHaveLength(1)
    expect(state.clear).not.toHaveBeenCalled()
    press(tree, messages.common.cancel)
    expect(testId(tree, 'notification-unread')).toHaveLength(50)
    press(tree, messages.notifications.deleteNotification.replace('{title}', 'Alert 0'))
    press(tree, messages.notifications.deleteAll)
    press(tree, messages.notifications.delete)
    refresh(tree)
    expect(text(tree, messages.notifications.empty)).toHaveLength(1)
    expect(hosts(tree, 'Pressable', messages.notifications.deleteUndo)).toHaveLength(0)
    TestRenderer.act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
  })
  it.each([
    ['/streak', '/progress', en.nav.progress], ['/', '/', en.nav.today],
    ['/calendar', '/calendar', en.nav.calendar], ['/profile', '/profile', en.nav.profile],
    ['/', '/habits/a12b34cd-1234-4567-89ab-123456789abc', en.notifications.habit, 'a12b34cd-1234-4567-89ab-123456789abc'], ['/chat', '/', en.nav.today],
    ['/calendar-sync?mode=review', '/calendar', en.nav.calendar],
  ])('navigates from detail %s to the target after closing', (url, destination, labelTarget, habitId: string | null = null) => {
    const tree = render(<NotificationDetailModal open notification={createMockNotification({ url, habitId })}
      onClose={vi.fn()} onMarkAsRead={vi.fn()} onDelete={vi.fn()} />)
    const label = en.notifications.openIn.replace('{target}', labelTarget)
    const target = hosts(tree, 'Pressable').find((node) => node.findAll((child) => child.type === 'Text' && child.props.children === label).length > 0)!
    TestRenderer.act(() => target.props.onPress?.())
    expect(state.push).toHaveBeenCalledWith(destination)
    expect(useUIStore.getState().astraConversationOpen).toBe(url === '/chat')
  })

  it.each([
    ['en', '5 min ago · Calendar'],
    ['pt-BR', 'há 5 min · Calendário'],
  ])('renders the complete detail metadata with one middle dot in %s', (locale, metadata) => {
    state.locale = locale
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    state.notifications = [createMockNotification({
      title: 'Reminder', url: '/calendar', isRead: false, createdAtUtc: '2026-09-06T11:55:00Z',
    })]
    const messages = locale === 'en' ? en : pt
    const tree = render()
    press(tree, `Reminder. ${messages.notifications.unread}. ${messages.nav.calendar}`)
    const renderedText = hosts(tree, 'Text').map((node) =>
      React.Children.toArray(node.props.children as React.ReactNode)
        .filter((child) => typeof child === 'string' || typeof child === 'number').join(''),
    )
    expect(renderedText).toContain(metadata)
  })
})

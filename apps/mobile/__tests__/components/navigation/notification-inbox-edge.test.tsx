import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { __setWindowDimensions } from '../../../test-mocks/react-native'

const { act, create }: typeof import('react-test-renderer') = require('react-test-renderer')
const inbox = vi.hoisted(() => ({ items: [] as import('@orbit/shared/types/notification').NotificationItem[], state: 'empty' }))
const states = ['populated', 'loading', 'empty', 'error'] as const
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-notifications', () => ({
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutateAsync: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({
  notifications: inbox.items, visibleNotifications: inbox.items, visibleUnreadCount: inbox.items.length,
  isLoading: inbox.state === 'loading', isError: inbox.state === 'error', pendingDeleteIds: [], refetch: vi.fn(),
}) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/notifications' }))
vi.mock('react-native-safe-area-context', async () => ({ SafeAreaView: (await import('react-native')).View }))

interface Host {
  type: string
  props: { style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>); accessibilityLabel?: string }
  children: (Host | string)[] | null
}

function layoutHost(host: Host, nodes: Map<Host, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(host, node)
  const resolved = typeof host.props.style === 'function' ? host.props.style({ pressed: false }) : host.props.style
  const style = StyleSheet.flatten(resolved ?? {})
  if (style.width === '100%') node.setWidthPercent(100)
  for (const [key, apply] of [
    ['width', (value: number) => node.setWidth(value)], ['maxWidth', (value: number) => node.setMaxWidth(value)],
    ['height', (value: number) => node.setHeight(value)], ['minHeight', (value: number) => node.setMinHeight(value)],
    ['flex', (value: number) => node.setFlex(value)], ['gap', (value: number) => node.setGap(Yoga.GUTTER_ALL, value)],
  ] as const) if (typeof style[key] === 'number') apply(style[key])
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignSelf === 'center') node.setAlignSelf(Yoga.ALIGN_CENTER)
  if (style.alignSelf === 'flex-start') node.setAlignSelf(Yoga.ALIGN_FLEX_START)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  for (const [key, edge] of [['padding', Yoga.EDGE_ALL], ['paddingHorizontal', Yoga.EDGE_HORIZONTAL],
    ['paddingVertical', Yoga.EDGE_VERTICAL], ['paddingLeft', Yoga.EDGE_LEFT], ['paddingRight', Yoga.EDGE_RIGHT],
    ['paddingTop', Yoga.EDGE_TOP], ['paddingBottom', Yoga.EDGE_BOTTOM]] as const) {
    if (typeof style[key] === 'number') node.setPadding(edge, style[key])
  }
  ;(host.children ?? []).filter((child): child is Host => typeof child !== 'string')
    .forEach((child, index) => node.insertChild(layoutHost(child, nodes), index))
  return node
}

function leadingEdge(node: YogaNode): number {
  let left = 0
  for (let current: YogaNode | null = node; current; current = current.getParent()) left += current.getComputedLeft()
  return left
}

afterEach(() => __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }))

describe('Avisos content edge on Android', () => {
  it.each([412, 600, 840, 1352].flatMap((width) => states.map((state) => ({ width, state }))))(
    'keeps a full window header and drawn content width at $width in $state', async ({ width, state }) => {
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
      inbox.state = state
      inbox.items = state === 'populated' ? [0, 1, 2].map((index) => createMockNotification({ id: `edge-${index}` })) : []
      let renderer: ReturnType<typeof create> & { toJSON: () => Host; unmount: () => void }
      await act(() => { renderer = create(<View style={{ width, height: 915 }}><NotificationInbox /></View>) as typeof renderer })
      const hosts = renderer!.toJSON()
      const screen = hosts.children![0] as Host
      const header = screen.children![0] as Host
      const nodes = new Map<Host, YogaNode>()
      const layout = layoutHost(hosts, nodes)
      try {
        layout.calculateLayout(width, 915, Yoga.DIRECTION_LTR)
        const list = [...nodes].find(([host]) => host.props.accessibilityLabel === 'notifications.title')![1]
        const firstRow = list.getChild(0)
        expect(leadingEdge(firstRow)).toBe(16)
        expect(nodes.get(screen)!.getComputedWidth()).toBe(width)
        expect(nodes.get(header)!.getComputedWidth()).toBe(width)
        expect(leadingEdge(nodes.get(header)!)).toBe(0)
        expect(list.getComputedWidth()).toBe(width < 1024 ? width : 592)
        expect(firstRow.getComputedWidth()).toBe(width < 1024 ? width - 32 : 560)
        expect(list.getChild(list.getChildCount() - 1).getComputedWidth()).toBe(firstRow.getComputedWidth())
      } finally {
        layout.freeRecursive()
        await act(() => renderer!.unmount())
      }
    },
  )
})

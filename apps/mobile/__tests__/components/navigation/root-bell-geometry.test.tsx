import React, { type ReactNode } from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, expect, it, vi } from 'vitest'
import ProgressScreen from '@/app/(tabs)/progress'
import ProfileScreen from '@/app/(tabs)/profile'
import { CalendarOptions } from '@/app/(tabs)/calendar/_components/calendar-options'
import { TodayDateControl } from '@/components/today/today-date-control'
import { Shell412 } from '@/components/shell/shell-412'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => navigation, usePathname: () => '/', useLocalSearchParams: () => ({}) }))
vi.mock('react-native-safe-area-context', async () => ({
  SafeAreaView: (await import('react-native')).View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined, isLoading: true, refetch: vi.fn(), patchProfile: vi.fn() }) }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ isLoading: true }) }))
vi.mock('@/hooks/use-gamification', () => ({ useGamificationProfile: () => ({ isLoading: true }) }))
vi.mock('@/hooks/use-logout', () => ({ useLogout: () => ({ logout: vi.fn(), isPending: false }) }))

interface Host {
  type: string
  props: {
    style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle)
    contentContainerStyle?: ViewStyle
    accessibilityLabel?: string
    accessibilityRole?: string
    testID?: string
  }
  children: (Host | string)[] | null
}

interface Instance {
  type: unknown
  props: Host['props'] & { onPress: () => void }
  parent: Instance | null
}

type Tree = ReturnType<typeof renderer.create> & {
  toJSON: () => Host
  root: { find: (predicate: (node: Instance) => boolean) => Instance }
  unmount: () => void
}

function applyFlexStyle(node: YogaNode, style: ViewStyle) {
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignSelf === 'center') node.setAlignSelf(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.justifyContent === 'flex-end') node.setJustifyContent(Yoga.JUSTIFY_FLEX_END)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
}

function applyDimensions(node: YogaNode, style: ViewStyle) {
  if (typeof style.width === 'number' || style.width === '100%') node.setWidth(style.width)
  if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applyFlexStyle(node, style)
  applyDimensions(node, style)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.paddingTop === 'number') node.setPadding(Yoga.EDGE_TOP, style.paddingTop)
  if (typeof style.paddingBottom === 'number') node.setPadding(Yoga.EDGE_BOTTOM, style.paddingBottom)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  if (style.display === 'none') node.setDisplay(Yoga.DISPLAY_NONE)
}

function bounds(node: YogaNode) {
  let left = 0
  let top = 0
  let ancestor: YogaNode | null = node
  while (ancestor) { left += ancestor.getComputedLeft(); top += ancestor.getComputedTop(); ancestor = ancestor.getParent() }
  return { right: left + node.getComputedWidth(), centerY: top + node.getComputedHeight() / 2, width: node.getComputedWidth(), height: node.getComputedHeight() }
}

function measureBell(host: Host, width: number) {
  const bells: YogaNode[] = []
  const rows: YogaNode[] = []
  function build(host: Host): YogaNode {
    const node = Yoga.Node.create()
    const declared = host.props.style
    applyStyle(node, StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {}))
    if (host.props.accessibilityRole === 'button' && host.props.accessibilityLabel === 'notifications.bell') bells.push(node)
    if (['today-header-actions', 'calendar-shell-header', 'root-notification-header'].includes(host.props.testID ?? '')) rows.push(node)
    let owner = node
    if (host.props.contentContainerStyle) {
      owner = Yoga.Node.create()
      applyStyle(owner, StyleSheet.flatten(host.props.contentContainerStyle))
      node.insertChild(owner, 0)
    }
    ;(host.children ?? []).filter((child): child is Host => typeof child !== 'string').forEach((child, index) => owner.insertChild(build(child), index))
    return node
  }
  const layout = build(host)
  try {
    layout.calculateLayout(width, 915, Yoga.DIRECTION_LTR)
    expect(bells).toHaveLength(1)
    expect(rows).toHaveLength(1)
    return { bell: bounds(bells[0]!), row: bounds(rows[0]!) }
  } finally { layout.freeRecursive() }
}

const noop = () => {}
const today = <TodayDateControl dayName="Wednesday" numericDate="08/04/2026" isTodaySelected nextDisabled={false}
  previousLabel="Previous" todayLabel="Today" goToTodayLabel="Today" nextLabel="Next" moreLabel="Options"
  selectLabel="Select" collapseLabel="Collapse" allCollapsed={false} refreshLabel="Refresh" completedLabel="Completed"
  showCompleted={false} isFetching={false} searchLabel="Search" onSearch={noop} onToggleSelect={noop}
  onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop} onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} />

afterEach(() => { __resetTestHostConfig(); vi.clearAllMocks() })

it.each([320, 412, 840].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))(
  'aligns all four root bells at $width with text scale $fontScale and opens Avisos', async ({ width, fontScale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    const surfaces: [string, ReactNode][] = [
      ['Hoje', today],
      ['Calendário', <CalendarOptions key="calendar" tokens={createTokensV2('purple', 'dark')} />],
      ['Progresso', <ProgressScreen key="progress" />],
      ['Perfil', <ProfileScreen key="profile" />],
    ]
    let reference: ReturnType<typeof measureBell> | undefined
    for (const [name, surface] of surfaces) {
      let tree!: Tree
      await renderer.act(() => { tree = renderer.create(<Shell412 tabBar={null}>{surface}</Shell412>) as Tree })
      try {
        const geometry = measureBell(tree.toJSON(), width)
        reference ??= geometry
        expect(Math.abs(geometry.bell.right - reference.bell.right), `${name} trailing edge`).toBeLessThanOrEqual(1)
        expect.soft(Math.abs(geometry.bell.centerY - reference.bell.centerY), `${name} vertical centre`).toBeLessThanOrEqual(1)
        expect(geometry.bell.width).toBeGreaterThanOrEqual(48)
        expect(geometry.bell.height).toBeGreaterThanOrEqual(48)
        expect(geometry.row.height).toBe(48)
        expect(geometry.bell.centerY).toBe(geometry.row.centerY)
        const bell = tree.root.find((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'notifications.bell' && node.props.accessibilityRole === 'button')
        await renderer.act(() => bell.props.onPress())
        expect(navigation.push).toHaveBeenLastCalledWith('/notifications')
        navigation.push.mockClear()
        if (name === 'Progresso' || name === 'Perfil') {
          let ancestor = bell.parent
          while (ancestor && ancestor.type !== 'ScrollView' && ancestor.type !== 'NestableScrollContainer') ancestor = ancestor.parent
          expect(ancestor, `${name} scrolling bell row`).not.toBeNull()
        }
      } finally { await renderer.act(() => tree.unmount()) }
    }
  },
)

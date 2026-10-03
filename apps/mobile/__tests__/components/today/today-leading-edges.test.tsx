import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { createMockHabit, createMockNotification } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import { TodayAstra } from '@/components/today/today-astra'
import { TodayDateControl } from '@/components/today/today-date-control'
import { HabitRow } from '@/components/habits/habit-row'
import { __setWindowDimensions } from '../../../test-mocks/react-native'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const { act, create } = TestRenderer

vi.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => ({ navigate: vi.fn(), push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [createMockNotification({ url: '/chat', body: 'Sua rotina mudou. Vamos conversar?', createdAtUtc: new Date().toISOString() })] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))

interface Host {
  type: string
  props: {
    style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>)
    testID?: string
    numberOfLines?: number
  }
  children: (Host | string)[] | null
}

const noop = () => {}
const dateProps = {
  dayName: 'Quarta-feira', shortDayName: 'Qua.', numericDate: '8 abr.', isTodaySelected: true, nextDisabled: false,
  previousLabel: 'Previous', nextLabel: 'Next', todayLabel: 'Today', goToTodayLabel: 'Today',
  moreLabel: 'Options', searchLabel: 'Search', selectLabel: 'Select', collapseLabel: 'Collapse', allCollapsed: false,
  refreshLabel: 'Refresh', completedLabel: 'Completed', showCompleted: false, isFetching: false,
  onGoToPreviousDay: noop, onGoToToday: noop, onGoToNextDay: noop, onSearch: noop,
  onToggleSelect: noop, onToggleCollapse: noop, onRefresh: noop, onToggleCompleted: noop,
}

function textContent(element: Host): string {
  return (element.children ?? []).map((child) => typeof child === 'string' ? child : textContent(child)).join('')
}

function measureText(element: Host, style: TextStyle, fontScale: number) {
  const fontSize = Number(style.fontSize ?? 14) * fontScale
  const fontFile = style.fontFamily?.toString().startsWith('SpaceGrotesk')
    ? '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'
    : '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'
  const text = textContent(element).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  const bounds = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="200"><text y="100" font-family="${style.fontFamily?.toString().startsWith('SpaceGrotesk') ? 'Space Grotesk' : 'Geist'}" font-size="${fontSize}">${text}</text></svg>`,
    { font: { fontFiles: [require.resolve(fontFile)], loadSystemFonts: false } }).getBBox()
  if (!bounds) throw new Error(`No glyph bounds for ${text}`)
  return { width: Math.ceil(bounds.width + 8), lineHeight: Number(style.lineHeight ?? Number(style.fontSize ?? 14) * 1.55) * fontScale }
}

function applyInsets(node: YogaNode, style: ViewStyle) {
  for (const [suffix, edge] of [['', Yoga.EDGE_ALL], ['Left', Yoga.EDGE_LEFT], ['Right', Yoga.EDGE_RIGHT], ['Top', Yoga.EDGE_TOP], ['Bottom', Yoga.EDGE_BOTTOM], ['Vertical', Yoga.EDGE_VERTICAL], ['Horizontal', Yoga.EDGE_HORIZONTAL]] as const) {
    const padding = style[`padding${suffix}`]
    if (typeof padding === 'number') node.setPadding(edge, padding)
  }
  for (const [key, edge] of [['borderWidth', Yoga.EDGE_ALL], ['borderLeftWidth', Yoga.EDGE_LEFT], ['borderRightWidth', Yoga.EDGE_RIGHT], ['borderTopWidth', Yoga.EDGE_TOP], ['borderBottomWidth', Yoga.EDGE_BOTTOM]] as const) {
    const border = style[key]
    if (typeof border === 'number') node.setBorder(edge, border)
  }
}

function layoutHost(element: Host, fontScale: number, nodes: Map<Host, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(element, node)
  const resolved = typeof element.props.style === 'function' ? element.props.style({ pressed: false }) : element.props.style
  const style = StyleSheet.flatten(resolved ?? {})
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.alignSelf === 'stretch') node.setAlignSelf(Yoga.ALIGN_STRETCH)
  for (const [key, apply] of [
    ['width', (value: number) => node.setWidth(value)], ['height', (value: number) => node.setHeight(value)],
    ['minHeight', (value: number) => node.setMinHeight(value)], ['minWidth', (value: number) => node.setMinWidth(value)],
    ['flex', (value: number) => node.setFlex(value)], ['flexShrink', (value: number) => node.setFlexShrink(value)],
    ['flexGrow', (value: number) => node.setFlexGrow(value)], ['gap', (value: number) => node.setGap(Yoga.GUTTER_ALL, value)],
  ] as const) if (typeof style[key] === 'number') apply(style[key])
  applyInsets(node, style)
  if (element.type === 'Text') {
    const measured = measureText(element, style, fontScale)
    node.setMeasureFunc((available) => {
      const width = Math.min(measured.width, available)
      const lines = Math.min(element.props.numberOfLines ?? 1, Math.ceil(measured.width / Math.max(width, 1)))
      return { width, height: measured.lineHeight * lines }
    })
  } else {
    (element.children ?? []).filter((child): child is Host => typeof child !== 'string')
      .forEach((child, index) => node.insertChild(layoutHost(child, fontScale, nodes), index))
  }
  return node
}

function leadingPosition(node: YogaNode): number {
  let left = 0
  for (let current: YogaNode | null = node; current; current = current.getParent()) left += current.getComputedLeft()
  return left
}

afterEach(() => __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }))

describe('Hoje leading edges on Android', () => {
  it.each([320, 384].flatMap((width) => [1, 2].flatMap((fontScale) => [false, true].map((selectMode) => ({ width, fontScale, selectMode })))))(
    'shares two edges at $width dp and $fontScale text scale, selecting=$selectMode', ({ width, fontScale, selectMode }) => {
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
      let renderer: ReturnType<typeof create> & { toJSON: () => Host; unmount: () => void }
      void act(() => {
        renderer = create(<View style={{ paddingHorizontal: 16 }}>
          <TodayAstra today={formatAPIDate(new Date())} isTodaySelected suppressed={false} />
          <TodayDateControl {...dateProps} />
          {(['Leaf', 'Parent', 'Child'] as const).map((title) => <HabitRow key={title} habit={createMockHabit({ title: `${title} habit with a long name that needs more than one line` })}
            structuralColumn isSelectMode={selectMode} depth={title === 'Child' ? 1 : 0} hasChildren={title === 'Parent'}
            childrenTotal={title === 'Parent' ? 2 : 0} actions={{ onToggleExpand: noop, onToggleSelection: noop, onEdit: noop }} />)}
        </View>) as typeof renderer
      })
      const hosts = renderer!.toJSON()
      const nodes = new Map<Host, YogaNode>()
      const layout = layoutHost(hosts, fontScale, nodes)
      try {
        layout.setWidth(width)
        layout.calculateLayout(width, 'auto', Yoga.DIRECTION_LTR)
        const textEdges = [...nodes].filter(([element]) => element.type === 'Text' &&
          ['Sua rotina mudou. Vamos conversar?', 'Quarta-feira', 'Qua.', '8 abr.', 'Leaf', 'Parent', 'Child'].some((label) => textContent(element) === label || textContent(element).startsWith(`${label} habit`)))
        expect(textEdges).toHaveLength(6)
        for (const [, node] of textEdges) expect(Math.abs(leadingPosition(node) - 76)).toBeLessThanOrEqual(1)
        const rows = [...nodes].filter(([element]) => element.props.testID === 'habit-row')
        expect(rows).toHaveLength(3)
        for (const [, node] of rows) {
          expect(leadingPosition(node)).toBe(16)
          if (fontScale === 2) expect(node.getComputedHeight()).toBeGreaterThan(68)
        }
        for (const [element, node] of nodes) {
          if (element.type !== 'Pressable') continue
          expect(leadingPosition(node)).toBeGreaterThanOrEqual(16)
          expect(leadingPosition(node) + node.getComputedWidth()).toBeLessThanOrEqual(width - 16)
          expect(node.getComputedWidth()).toBeGreaterThanOrEqual(48)
          expect(node.getComputedHeight()).toBeGreaterThanOrEqual(48)
        }
      } finally { layout.freeRecursive(); void act(() => renderer!.unmount()) }
    },
  )
})

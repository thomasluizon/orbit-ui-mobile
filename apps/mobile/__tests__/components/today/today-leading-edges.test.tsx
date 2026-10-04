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

vi.mock('react-i18next', async () => {
  const { createInstance } = await import('i18next')
  const { default: ICUCommonJs } = await import('i18next-icu/cjs')
  const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
  const { default: messages } = await import('@orbit/shared/i18n/pt-BR.json')
  const i18n = createInstance()
  await i18n.use(ICU).init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: messages } } })
  return { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) }
})

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
    accessibilityLabel?: string
    accessibilityRole?: string
    pointerEvents?: string
    onPress?: () => void
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
  const fontFamily = style.fontFamily?.toString().startsWith('SpaceGrotesk') ? 'Space Grotesk' : style.fontFamily?.toString().startsWith('GeistMono') ? 'Geist Mono' : 'Geist'
  const fontFile = fontFamily === 'Geist Mono' ? '@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf' : style.fontFamily?.toString().startsWith('SpaceGrotesk')
    ? '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'
    : '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'
  const text = textContent(element).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  const bounds = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="200"><text y="100" font-family="${fontFamily}" font-size="${fontSize}">${text}</text></svg>`,
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

function applyPositions(node: YogaNode, style: ViewStyle) {
  for (const [key, edge] of [['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT], ['top', Yoga.EDGE_TOP], ['bottom', Yoga.EDGE_BOTTOM]] as const) {
    if (typeof style[key] === 'number') node.setPosition(edge, style[key])
  }
}

function layoutHost(element: Host, fontScale: number, nodes: Map<Host, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(element, node)
  const resolved = typeof element.props.style === 'function' ? element.props.style({ pressed: false }) : element.props.style
  const style = StyleSheet.flatten(resolved ?? {})
  if (typeof style.marginTop === 'number') node.setMargin(Yoga.EDGE_TOP, style.marginTop)
  if (style.width === '100%') node.setWidthPercent(100)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  applyPositions(node, style)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.alignSelf === 'flex-start') node.setAlignSelf(Yoga.ALIGN_FLEX_START)
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
      const lines = Math.min(element.props.numberOfLines ?? Number.POSITIVE_INFINITY, Math.ceil(measured.width / Math.max(width, 1)))
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

function topPosition(node: YogaNode): number {
  let top = 0
  for (let current: YogaNode | null = node; current; current = current.getParent()) top += current.getComputedTop()
  return top
}

function assertPrimaryFill(nodes: Map<Host, YogaNode>, row: [Host, YogaNode]) {
  const primaryLayer = [...nodes].find(([element]) => element.type === 'Pressable' &&
    element.props.accessibilityLabel?.startsWith('Parent habit'))!
  const [, primaryNode] = primaryLayer
  const [rowHost, rowNode] = row
  const rowStyle = StyleSheet.flatten(rowHost.props.style as StyleProp<ViewStyle>)
  expect(primaryNode.getComputedWidth()).toBe(rowNode.getComputedWidth() - (rowStyle.borderLeftWidth ?? 0) - (rowStyle.borderRightWidth ?? 0))
  expect(primaryNode.getComputedHeight()).toBe(rowNode.getComputedHeight() - (rowStyle.borderTopWidth ?? 0) - (rowStyle.borderBottomWidth ?? 0))
  const pressedStyle = primaryLayer[0].props.style
  expect(typeof pressedStyle).toBe('function')
  if (typeof pressedStyle !== 'function') throw new Error('Primary target has no press feedback')
  expect(StyleSheet.flatten(pressedStyle({ pressed: true }))).toMatchObject({
    borderRadius: 20, overflow: 'hidden', backgroundColor: expect.any(String),
  })
}

function containsHost(host: Host, element: Host): boolean {
  return host === element || (host.children ?? []).some((child) => typeof child !== 'string' && containsHost(child, element))
}

function assertPaddedBody(nodes: Map<Host, YogaNode>, rowHost: Host) {
  const descendants = [...nodes].filter(([element]) => containsHost(rowHost, element))
  const [body, bodyNode] = descendants.find(([element]) => element.type === 'Pressable' &&
    element.props.accessibilityRole === 'button' && element.props.accessibilityLabel?.includes('habit with a long name'))!
  const [, wellNode] = descendants.find(([element]) => {
    const style = StyleSheet.flatten((element.props.style ?? {}) as StyleProp<ViewStyle>)
    return style.borderRadius === 12 && (style.width === 32 || style.width === 46)
  })!
  expect(leadingPosition(wellNode) - leadingPosition(bodyNode)).toBeGreaterThanOrEqual(8)
  if (typeof body.props.style !== 'function') throw new Error('Body target has no press feedback')
  for (const pressed of [false, true]) expect(StyleSheet.flatten(body.props.style({ pressed })).paddingLeft).toBeGreaterThanOrEqual(8)
}

function pressAt(element: Host, nodes: Map<Host, YogaNode>, x: number, y: number): boolean {
  const node = nodes.get(element)!
  const inside = x >= leadingPosition(node) && x < leadingPosition(node) + node.getComputedWidth()
    && y >= topPosition(node) && y < topPosition(node) + node.getComputedHeight()
  if (!inside || element.props.pointerEvents === 'none') return false
  if (element.props.pointerEvents !== 'box-only') {
    const children = (element.children ?? []).filter((child): child is Host => typeof child !== 'string')
    for (const child of [...children].reverse()) if (pressAt(child, nodes, x, y)) return true
  }
  if (element.props.onPress && element.props.pointerEvents !== 'box-none') {
    element.props.onPress()
    return true
  }
  return false
}

afterEach(() => __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }))

describe('Hoje leading edges on Android', () => {
  it.each([320, 384, 600].flatMap((width) => [1, 2].flatMap((fontScale) => [false, true].map((selectMode) => ({ width, fontScale, selectMode })))))(
    'shares two edges at $width dp and $fontScale text scale, selecting=$selectMode', ({ width, fontScale, selectMode }) => {
      __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
      const onDetail = vi.fn()
      const onToggleSelection = vi.fn()
      let renderer: ReturnType<typeof create> & { toJSON: () => Host; unmount: () => void }
      void act(() => {
        renderer = create(<View style={{ paddingHorizontal: 16 }}>
          <TodayAstra today={formatAPIDate(new Date())} isTodaySelected suppressed={false} />
          <TodayDateControl {...dateProps} />
          {(['Leaf', 'Parent', 'Child'] as const).map((title) => <HabitRow key={title} habit={createMockHabit({ title: `${title} habit with a long name that needs more than one line` })}
            structuralColumn isSelectMode={selectMode} depth={title === 'Child' ? 1 : 0} hasChildren={title === 'Parent'}
            childrenTotal={title === 'Parent' ? 2 : 0} actions={{ onToggleExpand: noop, onToggleSelection, onDetail, onEdit: noop }} />)}
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
        const rows = [...nodes].filter(([element]) => element.props.testID === 'habit-row')
        expect(rows).toHaveLength(3)
        for (const [rowHost] of rows) assertPaddedBody(nodes, rowHost)
        for (const [, node] of textEdges) expect(Math.abs(leadingPosition(node) - 84)).toBeLessThanOrEqual(1)
        for (const [, node] of rows) {
          expect(leadingPosition(node)).toBe(16)
          if (fontScale === 2) expect(node.getComputedHeight()).toBeGreaterThan(68)
        }
        const progress = [...nodes].find(([element]) => element.type === 'Text' && textContent(element) === '0 de 2')!
        expect(progress, JSON.stringify([...nodes].filter(([element]) => element.type === 'Text').map(([element]) => textContent(element)))).toBeDefined()
        const [progressHost, progressNode] = progress
        const measuredProgress = measureText(progressHost, StyleSheet.flatten(progressHost.props.style as StyleProp<TextStyle>), fontScale)
        expect(progressNode.getComputedWidth()).toBeGreaterThanOrEqual(measuredProgress.width)
        const parentTitle = textEdges.find(([element]) => textContent(element).startsWith('Parent habit'))![1]
        expect(topPosition(progressNode)).toBeGreaterThanOrEqual(topPosition(parentTitle) + parentTitle.getComputedHeight())
        void act(() => {
          pressAt(hosts, nodes, leadingPosition(progressNode) + progressNode.getComputedWidth() / 2,
            topPosition(progressNode) + progressNode.getComputedHeight() / 2)
        })
        expect(selectMode ? onToggleSelection : onDetail).toHaveBeenCalledExactlyOnceWith()
        expect(selectMode ? onDetail : onToggleSelection).not.toHaveBeenCalled()
        if (fontScale === 2) {
          assertPrimaryFill(nodes, rows[1]!)
          const parentHosts = new Set<Host>()
          const collectParentHosts = (host: Host) => {
            parentHosts.add(host)
            for (const child of host.children ?? []) if (typeof child !== 'string') collectParentHosts(child)
          }
          collectParentHosts(rows[1]![0])
          const parentControls = [...nodes].filter(([element]) => parentHosts.has(element) &&
            ((element.type === 'Pressable' && !element.props.accessibilityLabel?.startsWith('Parent habit')) || element.props.accessibilityRole === 'image'))
          expect(parentControls).toHaveLength(selectMode ? 2 : 3)
          for (const [, control] of parentControls) {
            const firstLineCenter = topPosition(parentTitle) + 20
            expect(topPosition(control)).toBeLessThanOrEqual(firstLineCenter)
            expect(topPosition(control) + control.getComputedHeight()).toBeGreaterThan(firstLineCenter)
          }
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

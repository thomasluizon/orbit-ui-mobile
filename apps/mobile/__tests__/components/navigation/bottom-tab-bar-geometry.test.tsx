import type { ReactNode } from 'react'
import { Composer } from '@/components/shell/composer'
import { AppBar } from '@/components/ui/app-bar'
import { Shell412 } from '@/components/shell/shell-412'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { StyleSheet, View, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 24, left: 0 }) }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
interface Host {
  type: string
  props: { style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>); testID?: string; children?: ReactNode; numberOfLines?: number; horizontal?: boolean; contentContainerStyle?: ViewStyle }
  children: (Host | string)[] | null
}

function applyDimensions(node: YogaNode, style: ViewStyle) {
  for (const [key, setter] of [
    ['width', 'setWidth'], ['height', 'setHeight'], ['minWidth', 'setMinWidth'],
    ['minHeight', 'setMinHeight'], ['maxWidth', 'setMaxWidth'], ['flexGrow', 'setFlexGrow'],
    ['flexShrink', 'setFlexShrink'], ['flexBasis', 'setFlexBasis'],
  ] as const) {
    const value = style[key]
    if (typeof value === 'number') node[setter](value)
  }
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  if (typeof style.flex === 'number') node.setFlex(style.flex)
  if (style.width === '100%') node.setWidthPercent(100)
}

function applyAlignment(node: YogaNode, style: ViewStyle) {
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
}

function applyPadding(node: YogaNode, style: ViewStyle) {
  for (const [key, edge] of [['paddingVertical', Yoga.EDGE_VERTICAL], ['paddingHorizontal', Yoga.EDGE_HORIZONTAL], ['paddingTop', Yoga.EDGE_TOP], ['paddingBottom', Yoga.EDGE_BOTTOM], ['padding', Yoga.EDGE_ALL]] as const) {
    if (typeof style[key] === 'number') node.setPadding(edge, style[key])
  }
  if (typeof style.borderTopWidth === 'number') node.setBorder(Yoga.EDGE_TOP, style.borderTopWidth)
}

function layoutHost(host: Host, nodes: Map<string, YogaNode>, fontScale: number): YogaNode {
  const node = Yoga.Node.create()
  if (host.type === 'ScrollView') { node.setFlexGrow(1); node.setFlexShrink(1); node.setOverflow(Yoga.OVERFLOW_SCROLL) }
  const declared = host.props.style
  const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {})
  applyDimensions(node, style)
  applyAlignment(node, style)
  applyPadding(node, style)
  if (host.props.testID) nodes.set(host.props.testID, node)
  if (host.type === 'Text') {
    if (style.fontSize === 12 && style.lineHeight === 16) expect(host.props.numberOfLines).toBeUndefined()
    node.setMeasureFunc((width) => ({ width, height: (style.lineHeight ?? style.fontSize ?? 0) * fontScale }))
  } else if (host.type === 'ScrollView') {
    if (host.props.horizontal) node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
    node.insertChild(layoutHost({ type: 'View', props: { style: host.props.contentContainerStyle }, children: host.children }, nodes, fontScale), 0)
  } else {
    (host.children ?? []).filter((child): child is Host => typeof child !== 'string')
      .forEach((child, index) => node.insertChild(layoutHost(child, nodes, fontScale), index))
  }
  return node
}

function bounds(node: YogaNode) {
  let left = 0
  let top = 0
  let parent: YogaNode | null = node
  while (parent) {
    left += parent.getComputedLeft()
    top += parent.getComputedTop()
    parent = parent.getParent()
  }
  return { left, top, right: left + node.getComputedWidth(), bottom: top + node.getComputedHeight() }
}

const destinations = ['today', 'calendar', 'progress', 'profile'] as const

afterEach(() => { __resetTestHostConfig() })

describe('Native bottom tab layout', () => {
  it.each([360, 320])('budgets header, safe areas, composer and full tab targets inside a %ipx tall window', (height) => {
    __setWindowDimensions({ width: 740, height, scale: 1, fontScale: 1 })
    let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
    void renderer.act(() => { tree = renderer.create(<Shell412
      header={<AppBar title={en.nav.today} onBack={vi.fn()} backLabel={en.common.back} />}
      composer={<Composer state="idle" value="" words={en.shell.composer}
        suggestions={toComposerSuggestions(['today', 'calendar', 'progress'].map((id) => ({ id, label: en.nav[id as 'today' | 'calendar' | 'progress'], onSelect: vi.fn() })))}
        onChangeValue={vi.fn()} onSend={vi.fn()} onVoice={vi.fn()} voiceWords={en.shell.composer.voice}
        onAttachFile={vi.fn()} onAttachImage={vi.fn()}
        attachWords={{ file: en.chat.attachFile, image: en.chat.attachImage, trayLabel: en.chat.attachFile, remove: (name) => name }} />}
      tabBar={<BottomTabBar label={en.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
        items={destinations.map((id) => ({ id, label: en.nav[id], icon: () => <View style={{ width: 24, height: 24 }} /> }))} />}>
      <View style={{ height: 1600 }} />
    </Shell412>) as typeof tree })
    const nodes = new Map<string, YogaNode>()
    const root = layoutHost(tree.toJSON(), nodes, 1)
    try {
      root.calculateLayout(740, height, Yoga.DIRECTION_LTR)
      expect(bounds(nodes.get('shell-bottom')!).bottom).toBeLessThanOrEqual(height)
      expect(nodes.get('shell-scroller')!.getComputedHeight()).toBeGreaterThanOrEqual(48)
      expect(nodes.get('bottom-tab-destinations')!.getComputedHeight()).toBe(80)
      const pinned = nodes.get('shell-pinned-slot')!
      expect(pinned.getComputedHeight()).toBeGreaterThanOrEqual(48)
      expect(bounds(pinned).bottom).toBeLessThanOrEqual(bounds(nodes.get('shell-tab-bar')!).top)
    } finally { root.freeRecursive(); void renderer.act(() => tree.unmount()) }
  })

  it.each([en, ptBR].flatMap((messages) => [1, 2].map((fontScale) => ({ messages, fontScale }))))(
    'keeps icon clearance and disjoint targets at 320 with $fontScale text in $messages.nav.calendar',
    ({ messages, fontScale }) => {
      __setWindowDimensions({ width: 320, height: 740, scale: 1, fontScale })
      let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
      void renderer.act(() => { tree = renderer.create(<BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
        items={destinations.map((id) => ({ id, label: messages.nav[id], icon: () => <View style={{ width: 24, height: 24 }} /> }))} />) as typeof tree })
      const nodes = new Map<string, YogaNode>()
      const root = layoutHost(tree.toJSON(), nodes, fontScale)
      try {
        root.calculateLayout(320, undefined, Yoga.DIRECTION_LTR)
        if (fontScale === 1) expect(root.getComputedHeight()).toBe(80)
        const targets = destinations.map((id) => nodes.get(`tab-${id}-${id === 'today' ? 'current' : 'inactive'}`)!)
        for (const [index, id] of destinations.entries()) {
          const indicator = nodes.get(`tab-indicator-${id}`)!
          const target = targets[index]!
          expect(indicator.getComputedWidth()).toBe(56)
          expect(indicator.getComputedHeight()).toBe(32)
          expect(bounds(indicator.getChild(0)).top).toBeGreaterThanOrEqual(16)
          expect(target.getComputedWidth()).toBeGreaterThanOrEqual(48)
          expect(target.getComputedHeight()).toBeGreaterThanOrEqual(48)
          const label = target.getChild(1)
          expect(label.getComputedHeight()).toBe(16 * fontScale)
          expect(bounds(label).top - bounds(indicator).bottom).toBe(4)
          expect(bounds(label).bottom).toBeLessThanOrEqual(bounds(target).bottom)
          if (index > 0) {
            const current = bounds(target)
            const previous = bounds(targets[index - 1]!)
            expect(current.left >= previous.right || current.top >= previous.bottom).toBe(true)
          }
        }
      } finally {
        root.freeRecursive()
        void renderer.act(() => tree.unmount())
      }
    },
  )
})

import type { ReactNode } from 'react'
import { Composer } from '@/components/shell/composer'
import { AppBar } from '@/components/ui/app-bar'
import { Shell412 } from '@/components/shell/shell-412'
import { FlowShell } from '@/components/shell/flow-shell'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { StyleSheet, View, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { __emitKeyboardEvent, __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

vi.mock('react-native-safe-area-context', async () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 24, left: 0 }),
  SafeAreaView: (await import('react-native')).View,
}))

vi.mock('@/lib/use-app-theme', async () => {
  const { createSurfaces } = await import('@/lib/theme')
  return { useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: createSurfaces('orange', 'dark') }) }
})

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
  it.each([412, 1280].flatMap((width) => [100, 1600].map((contentHeight) => ({ width, contentHeight }))))(
    'owns onboarding clearance at $width with $contentHeight px of content', ({ width, contentHeight }) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
    void renderer.act(() => { tree = renderer.create(<FlowShell nav={false}
      action={<View testID="onboarding-action" style={{ height: 50 }} />}>
      <View testID="onboarding-content" style={{ height: contentHeight }} />
    </FlowShell>) as typeof tree })
    const nodes = new Map<string, YogaNode>()
    const root = layoutHost(tree.toJSON(), nodes, 1)
    try {
      root.calculateLayout(width, 900, Yoga.DIRECTION_LTR)
      const scroller = root.getChild(0)
      const contentContainer = scroller.getChild(0)
      const content = nodes.get('onboarding-content')!
      const action = nodes.get('onboarding-action')!
      const maxScroll = Math.max(0, contentContainer.getComputedHeight() - scroller.getComputedHeight())
      expect(contentContainer.getComputedPadding(Yoga.EDGE_BOTTOM)).toBe(96)
      expect(bounds(action).top - (bounds(content).bottom - maxScroll)).toBeGreaterThanOrEqual(96)
      expect(bounds(action).bottom).toBeLessThanOrEqual(900)
      expect(contentContainer.getComputedWidth()).toBeLessThanOrEqual(740)
    } finally { root.freeRecursive(); void renderer.act(() => tree.unmount()) }
  })

  it.each([120, 124, 160, 740])('keeps the full Create target revealable in a %ipx keyboard-constrained flow', (height) => {
    __setWindowDimensions({ width: 360, height, scale: 1, fontScale: 1 })
    const onSubmit = vi.fn()
    const onAttemptDismiss = vi.fn()
    let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
    void renderer.act(() => { tree = renderer.create(<HabitCreateFrame
      open presentation="screen" fromConversation={false} leaving={false}
      title={en.habits.createHabit} onAttemptDismiss={onAttemptDismiss}
      actions={<HabitCreateActions presentation="screen" pending={false} empty={false} subHabit={false}
        onCancel={vi.fn()} onSubmit={onSubmit} />}>
      <View style={{ height: 1600 }} />
    </HabitCreateFrame>) as typeof tree })
    void renderer.act(() => __emitKeyboardEvent('keyboardDidShow'))
    const nodes = new Map<string, YogaNode>()
    const root = layoutHost(tree.toJSON(), nodes, 1)
    try {
      root.calculateLayout(360, height, Yoga.DIRECTION_LTR)
      const pinned = nodes.get('shell-pinned-slot')!
      const button = nodes.get('button-primary-md')!
      const header = nodes.get('shell-header')!
      const backTarget = nodes.get('nav-header-back')!.getChild(0).getChild(0)
      const backBounds = bounds(backTarget)
      const headerBounds = bounds(header)
      expect(backTarget.getComputedHeight()).toBe(48)
      expect(header.getComputedHeight()).toBeGreaterThanOrEqual(backTarget.getComputedHeight())
      const headerMaxScroll = header.getChild(0).getComputedHeight() - header.getComputedHeight()
      const headerScroll = Math.min(Math.max(0, backBounds.top - headerBounds.top), Math.max(0, headerMaxScroll))
      expect(backBounds.top - headerScroll).toBeGreaterThanOrEqual(headerBounds.top)
      expect(backBounds.bottom - headerScroll).toBeLessThanOrEqual(headerBounds.bottom)
      const viewport = bounds(pinned)
      const target = bounds(button)
      expect(bounds(nodes.get('shell-background')!).top).toBe(0)
      expect(nodes.get('shell-background')!.getComputedPadding(Yoga.EDGE_TOP)).toBe(24)
      expect(button.getComputedHeight()).toBeGreaterThanOrEqual(48)
      expect(pinned.getComputedHeight()).toBeGreaterThanOrEqual(button.getComputedHeight())
      const maxScroll = pinned.getChild(0).getComputedHeight() - pinned.getComputedHeight()
      const scrollOffset = Math.min(Math.max(0, target.top - viewport.top), Math.max(0, maxScroll))
      expect(target.top - scrollOffset).toBeGreaterThanOrEqual(viewport.top)
      expect(target.bottom - scrollOffset).toBeLessThanOrEqual(viewport.bottom)
      const flowViewport = nodes.get('shell-flow-viewport')!
      const flowBounds = bounds(flowViewport)
      expect(flowBounds.bottom).toBeLessThanOrEqual(height)
      const flowMaxScroll = Math.max(0, flowViewport.getChild(0).getComputedHeight() - flowViewport.getComputedHeight())
      for (const [control, innerScroll] of [[backBounds, headerScroll], [target, scrollOffset]] as const) {
        const top = control.top - innerScroll
        const bottom = control.bottom - innerScroll
        const offset = Math.min(Math.max(0, top - flowBounds.top), flowMaxScroll)
        expect(top - offset).toBeGreaterThanOrEqual(flowBounds.top)
        expect(bottom - offset).toBeLessThanOrEqual(flowBounds.bottom)
      }
      if (height >= 122) expect(viewport.bottom).toBeLessThanOrEqual(height)
      expect(tree.root.findAll((node) => node.props.testID === 'shell-pinned-slot')[0]!.props.keyboardShouldPersistTaps).toBe('handled')
      const create = tree.root.findAll((node) => node.props.testID === 'button-primary-md')[0]!
      expect(create.props.disabled).toBe(false)
      void renderer.act(() => (create.props.onPress as () => void)())
      expect(onSubmit).toHaveBeenCalledOnce()
      const back = tree.root.findAll((node) => node.props.testID === 'nav-header-back')[0]!.findAll((node) => node.props.accessibilityRole === 'button' && node.props.onPress !== undefined)[0]!
      void renderer.act(() => (back.props.onPress as () => void)())
      expect(onAttemptDismiss).toHaveBeenCalledOnce()
    } finally { root.freeRecursive(); void renderer.act(() => tree.unmount()) }
  })

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

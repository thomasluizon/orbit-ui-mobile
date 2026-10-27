import { useState, type ReactNode } from 'react'
import { Composer } from '@/components/shell/composer'
import { AppBar } from '@/components/ui/app-bar'
import { Shell412 } from '@/components/shell/shell-412'
import { FlowShell } from '@/components/shell/flow-shell'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { Platform, ScrollView, StyleSheet, TextInput, View, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { PortalHost } from '@rn-primitives/portal'
import { Resvg } from '@resvg/resvg-js'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { TAB_BAR_LABEL_MAX_FONT_SCALE } from '@orbit/shared/contracts/navigation'
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
const layoutConfig = Yoga.Config.create()
layoutConfig.setPointScaleFactor(0)
interface Host {
  type: string
  props: { style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>); testID?: string; children?: ReactNode; numberOfLines?: number; maxFontSizeMultiplier?: number; horizontal?: boolean; contentContainerStyle?: ViewStyle }
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
  if (style.maxWidth === '100%') node.setMaxWidthPercent(100)
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

function measureText(node: YogaNode, host: Host, style: TextStyle, fontScale: number) {
  if (style.fontSize === 12 && style.lineHeight === 16) expect(host.props.numberOfLines).toBeUndefined()
  if (host.props.maxFontSizeMultiplier) fontScale = Math.min(fontScale, host.props.maxFontSizeMultiplier)
  const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
  const tabLabel = style.fontSize === 12 && style.lineHeight === 16
  const font = require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Geist" font-size="${Math.ceil(12 * fontScale)}">${tabLabel ? label : ''}</text></svg>`
  const ink = tabLabel ? new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox() : undefined
  const intrinsic = ink ? Math.ceil(ink.x + ink.width) : 0
  node.setMeasureFunc((width, mode) => {
    const measuredWidth = mode === Yoga.MEASURE_MODE_UNDEFINED ? intrinsic : Math.min(width, intrinsic)
    const lines = tabLabel ? Math.max(1, Math.ceil(intrinsic / Math.max(1, measuredWidth))) : 1
    return { width: tabLabel ? measuredWidth : width, height: (style.lineHeight ?? style.fontSize ?? 0) * fontScale * lines }
  })
}

function layoutHost(host: Host, nodes: Map<string, YogaNode>, fontScale: number): YogaNode {
  const node = Yoga.Node.create(layoutConfig)
  if (host.type === 'ScrollView') { node.setFlexGrow(1); node.setFlexShrink(1); node.setOverflow(Yoga.OVERFLOW_SCROLL) }
  const declared = host.props.style
  const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {})
  applyDimensions(node, style)
  applyAlignment(node, style)
  applyPadding(node, style)
  if (host.props.testID) nodes.set(host.props.testID, node)
  if (host.type === 'Text') {
    measureText(node, host, style, fontScale)
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

function DraftInput() {
  const [draft, setDraft] = useState('')
  return <TextInput testID="create-draft" value={draft} onChangeText={setDraft} />
}

function layoutCreateFrame(tree: ReturnType<typeof renderer.create> & { toJSON: () => Host }, nodes: Map<string, YogaNode>, height: number) {
  const initialRoot = layoutHost(tree.toJSON(), nodes, 1)
  initialRoot.calculateLayout(360, height, Yoga.DIRECTION_LTR)
  const shell = nodes.get('shell-412')!
  const layout = { x: shell.getComputedLeft(), y: shell.getComputedTop(), width: shell.getComputedWidth(), height: shell.getComputedHeight() }
  const onLayout = tree.root.findAll((node) => node.props.testID === 'shell-412')[0]!.props.onLayout as
    ((event: { nativeEvent: { layout: typeof layout } }) => void) | undefined
  void renderer.act(() => onLayout?.({ nativeEvent: { layout } }))
  initialRoot.freeRecursive()
  nodes.clear()
  const root = layoutHost(tree.toJSON(), nodes, 1)
  root.calculateLayout(360, height, Yoga.DIRECTION_LTR)
  expect(nodes.get('shell-412')!.getComputedHeight()).toBe(layout.height)
  return root
}

afterEach(() => { __resetTestHostConfig() })
afterAll(() => layoutConfig.free())

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

  it.each([
    ...[120, 124, 160, 740].map((height) => ({ height, windowHeight: height, keyboardVisible: true })),
    ...[120, 300].map((height) => ({ height, windowHeight: 740, keyboardVisible: true })),
    { height: 144, windowHeight: 740, keyboardVisible: false },
  ])('keeps full Create and Back targets revealable at $height with window $windowHeight and keyboard $keyboardVisible', ({ height, windowHeight, keyboardVisible }) => {
    expect(Platform.OS).toBe('android')
    __setWindowDimensions({ width: 360, height: windowHeight, scale: 1, fontScale: 1 })
    const onSubmit = vi.fn()
    const onAttemptDismiss = vi.fn()
    let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
    void renderer.act(() => { tree = renderer.create(<HabitCreateFrame
      open presentation="screen" fromConversation={false} leaving={false}
      title={en.habits.createHabit} onAttemptDismiss={onAttemptDismiss}
      actions={<HabitCreateActions presentation="screen" pending={false} empty={false} subHabit={false}
        onCancel={vi.fn()} onSubmit={onSubmit} />}>
      <DraftInput /><View style={{ height: 1600 }} />
    </HabitCreateFrame>) as typeof tree })
    const draftInput = tree.root.findAll((node) => node.type === DraftInput)[0]!
    const input = tree.root.findAll((node) => node.props.testID === 'create-draft')[0]!
    void renderer.act(() => (input.props.onChangeText as (value: string) => void)('Walk after lunch'))
    const initialNodes = new Map<string, YogaNode>()
    layoutCreateFrame(tree, initialNodes, 740).freeRecursive()
    if (keyboardVisible) void renderer.act(() => __emitKeyboardEvent('keyboardDidShow'))
    const nodes = new Map<string, YogaNode>()
    const root = layoutCreateFrame(tree, nodes, height)
    try {
      expect(tree.root.findAll((node) => node.props.testID === 'create-draft')[0]!.props.value).toBe('Walk after lunch')
      const body = tree.root.findAll((node) => node.type === KeyboardAwareScrollView)[0]!
      expect(body.findAll((node) => node.type === ScrollView)[0]!.props.scrollEnabled).not.toBe(false)
      root.calculateLayout(360, height, Yoga.DIRECTION_LTR)
      const pinned = nodes.get('shell-pinned-slot')!
      const button = nodes.get('button-primary-md')!
      const header = nodes.get('shell-header')!
      const backTarget = nodes.get('nav-header-back-control')!
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
      expect(tree.root.findAll((node) => node.props.testID === 'shell-flow-viewport')[0]!.props.scrollEnabled).toBe(flowMaxScroll > 0)
      expect(tree.root.findAll((node) => node.props.testID === 'shell-flow-viewport')[0]!.props.nestedScrollEnabled).toBe(flowMaxScroll > 0)
      for (const [control, innerScroll] of [[backBounds, headerScroll], [target, scrollOffset]] as const) {
        const top = control.top - innerScroll
        const bottom = control.bottom - innerScroll
        const offset = Math.min(Math.max(0, top - flowBounds.top), flowMaxScroll)
        expect(top - offset).toBeGreaterThanOrEqual(flowBounds.top)
        expect(bottom - offset).toBeLessThanOrEqual(flowBounds.bottom - (keyboardVisible ? 0 : 24))
      }
      if (height >= (keyboardVisible ? 122 : 146)) expect(viewport.bottom).toBeLessThanOrEqual(height)
      expect(tree.root.findAll((node) => node.props.testID === 'shell-pinned-slot')[0]!.props.keyboardShouldPersistTaps).toBe('handled')
      const create = tree.root.findAll((node) => node.props.testID === 'button-primary-md')[0]!
      expect(create.props.disabled).toBe(false)
      void renderer.act(() => (create.props.onPress as () => void)())
      expect(onSubmit).toHaveBeenCalledOnce()
      const back = tree.root.findAll((node) => node.props.testID === 'nav-header-back')[0]!.findAll((node) => node.props.accessibilityRole === 'button' && node.props.onPress !== undefined)[0]!
      void renderer.act(() => (back.props.onPress as () => void)())
      expect(onAttemptDismiss).toHaveBeenCalledOnce()
      const restoredNodes = new Map<string, YogaNode>()
      void renderer.act(() => __emitKeyboardEvent('keyboardDidHide'))
      layoutCreateFrame(tree, restoredNodes, 740).freeRecursive()
      expect(tree.root.findAll((node) => node.props.testID === 'shell-flow-viewport')[0]!.props.scrollEnabled).toBe(false)
      expect(tree.root.findAll((node) => node.type === DraftInput)[0]).toBe(draftInput)
      expect(tree.root.findAll((node) => node.props.testID === 'create-draft')[0]!.props.value).toBe('Walk after lunch')
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

  it.each([en, ptBR].flatMap((messages) => [320, 360, 412].flatMap((width) => [true, false].map((withComposer) => ({ messages, width, withComposer })))))(
    'clears the gesture inset at $width with 200% text and composer=$withComposer in $messages.nav.calendar',
    ({ messages, width, withComposer }) => {
      __setWindowDimensions({ width, height: 740, scale: 1, fontScale: 2 })
      const onSelect = vi.fn()
      let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
      void renderer.act(() => { tree = renderer.create(<Shell412
        header={<AppBar title={messages.nav.today} />}
        composer={withComposer ? <Composer state="idle" value="" words={messages.shell.composer} suggestions={[]}
          onChangeValue={vi.fn()} onSend={vi.fn()} /> : undefined}
        tabBar={<BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={onSelect}
          items={destinations.map((id) => ({ id, label: messages.nav[id], icon: () => <View style={{ width: 24, height: 24 }} /> }))} />}>
        <View style={{ height: 1600 }} />
      </Shell412>) as typeof tree })
      const nodes = new Map<string, YogaNode>()
      const root = layoutHost(tree.toJSON(), nodes, 2)
      try {
        root.calculateLayout(width, 740, Yoga.DIRECTION_LTR)
        const tabs = bounds(nodes.get('shell-tab-bar')!)
        expect(tabs.bottom).toBeCloseTo(740 - 24, 4)
        expect(bounds(nodes.get('shell-scroller')!).bottom).toBeLessThanOrEqual(tabs.top)
        if (withComposer) expect(bounds(nodes.get('shell-pinned-slot')!).bottom).toBeLessThanOrEqual(tabs.top)
        expect(nodes.get('bottom-tab-destinations')!.getComputedHeight()).toBeGreaterThan(80)
        for (const id of destinations) {
          const testID = `tab-${id}-${id === 'today' ? 'current' : 'inactive'}`
          const target = bounds(nodes.get(testID)!)
          expect(target.top).toBe(tabs.top + 1)
          expect(target.bottom).toBeLessThanOrEqual(tabs.bottom)
          expect(target.left).toBeGreaterThanOrEqual(0)
          expect(target.right).toBeLessThanOrEqual(width)
          const tab = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]!
          void renderer.act(() => (tab.props.onPress as () => void)())
        }
        expect(onSelect.mock.calls).toEqual(destinations.map((id) => [id]))
      } finally { root.freeRecursive(); void renderer.act(() => tree.unmount()) }
    },
  )

  it.each([en, ptBR].flatMap((messages) => [1, 1.3, 1.6, 2].flatMap((fontScale) => [
    ...[320, 360, 384, 412].map((width) => ({ messages, fontScale, width, platform: 'android' as const })),
    ...[320, 375, 440, 744, 820, 1032, 1366].map((width) => ({ messages, fontScale, width, platform: 'ios' as const })),
  ])))(
    'keeps compact tabs and disjoint targets on $platform at $width with $fontScale text in $messages.nav.calendar',
    ({ messages, fontScale, width, platform }) => {
      const previousPlatform = Platform.OS
      Platform.OS = platform
      __setWindowDimensions({ width, height: 740, scale: 1, fontScale })
      let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }
      void renderer.act(() => { tree = renderer.create(<BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
        items={destinations.map((id) => ({ id, label: messages.nav[id], icon: () => <View style={{ width: 24, height: 24 }} /> }))} />) as typeof tree })
      const nodes = new Map<string, YogaNode>()
      const root = layoutHost(tree.toJSON(), nodes, fontScale)
      try {
        root.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
        if (fontScale === 1) expect(root.getComputedHeight()).toBe(80)
        const targets = destinations.map((id) => nodes.get(`tab-${id}-${id === 'today' ? 'current' : 'inactive'}`)!)
        for (let index = 1; index < targets.length; index++) {
          const current = bounds(targets[index]!)
          const previous = bounds(targets[index - 1]!)
          expect(current.top).toBe(previous.top)
          expect(current.bottom).toBe(previous.bottom)
          expect(current.left).toBeGreaterThanOrEqual(previous.right)
        }
        for (const [index, id] of destinations.entries()) {
          const indicator = nodes.get(`tab-indicator-${id}`)!
          const target = targets[index]!
          expect(indicator.getComputedWidth()).toBe(56)
          expect(indicator.getComputedHeight()).toBe(32)
          expect(bounds(indicator).top).toBe(bounds(nodes.get('tab-indicator-today')!).top)
          expect(bounds(indicator.getChild(0)).top).toBeGreaterThanOrEqual(16)
          expect(target.getComputedWidth()).toBeGreaterThanOrEqual(48)
          expect(target.getComputedHeight()).toBeGreaterThanOrEqual(48)
          expect(bounds(target).right).toBeLessThanOrEqual(Math.min(width, 740))
          const label = target.getChild(1)
          const text = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === messages.nav[id])[0]!.findAll((node) => String(node.type) === 'Text')[0]!
          expect(text.props.maxFontSizeMultiplier).toBe(TAB_BAR_LABEL_MAX_FONT_SCALE)
          expect(text.props.numberOfLines).toBeUndefined()
          if (fontScale === 1) expect(label.getComputedHeight()).toBe(16)
          else expect(label.getComputedHeight()).toBeCloseTo(16 * Math.min(fontScale, TAB_BAR_LABEL_MAX_FONT_SCALE), 4)
          expect(bounds(label).left).toBeGreaterThanOrEqual(bounds(target).left)
          expect(bounds(label).right).toBeLessThanOrEqual(bounds(target).right)
          expect(bounds(label).top - bounds(indicator).bottom).toBe(4)
          expect(bounds(label).bottom).toBeLessThanOrEqual(bounds(target).bottom)
        }
      } finally {
        root.freeRecursive()
        void renderer.act(() => tree.unmount())
        Platform.OS = previousPlatform
      }
    },
  )
})

it.each([en, ptBR].flatMap((messages) => [320, 360, 384, 412].flatMap((width) => [1.3, 1.6, 2].map((fontScale) => ({ messages, width, fontScale })))))(
  'centres the full-size native viewer at $width and $fontScale in $messages.nav.calendar',
  ({ messages, width, fontScale }) => {
    __setWindowDimensions({ width, height: 740, scale: 1, fontScale })
    let tree!: ReturnType<typeof renderer.create> & { toJSON: () => Host[] }
    void renderer.act(() => { tree = renderer.create(<><BottomTabBar label={messages.nav.mainNavigation} activeId="today" onSelect={vi.fn()}
      items={destinations.map((id) => ({ id, label: messages.nav[id], icon: () => <View style={{ width: 24, height: 24 }} /> }))} /><PortalHost /></>) as typeof tree })
    try {
      for (const id of destinations) {
        const tab = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === messages.nav[id])[0]!
        void renderer.act(() => (tab.props.onLongPress as () => void)())
        const snapshot = tree.toJSON()
        const nodes = new Map<string, YogaNode>()
        const root = layoutHost(snapshot[1]!, nodes, fontScale)
        try {
          root.calculateLayout(width, 740, Yoga.DIRECTION_LTR)
          const viewer = bounds(nodes.get('tab-large-content-viewer')!)
          expect((viewer.left + viewer.right) / 2).toBeCloseTo(width / 2, 4)
          expect((viewer.top + viewer.bottom) / 2).toBeCloseTo(370, 4)
          expect(viewer.left).toBeGreaterThanOrEqual(16)
          expect(viewer.right).toBeLessThanOrEqual(width - 16)
          const label = nodes.get('tab-viewer-label')!
          expect(label.getComputedHeight()).toBeCloseTo(16 * fontScale, 4)
          expect(nodes.get('tab-viewer-icon')!.getComputedWidth()).toBeCloseTo(24 * fontScale, 4)
          expect(bounds(label).bottom).toBeLessThanOrEqual(viewer.bottom)
        } finally { root.freeRecursive() }
        void renderer.act(() => (tab.props.onPressOut as () => void)())
      }
    } finally { void renderer.act(() => tree.update(<></>)) }
  },
)

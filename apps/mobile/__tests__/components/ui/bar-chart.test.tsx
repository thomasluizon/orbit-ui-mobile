import React from 'react'
import { createRequire, Module } from 'node:module'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance } from 'react-test-renderer'
import { Pressable, StyleSheet } from 'react-native'
import type { ViewStyle } from 'react-native'
import * as ReactNative from 'react-native'
import type { LegacyHoverGesture as HoverGesture, GestureStateChangeEvent } from 'react-native-gesture-handler'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { INTERACTION_FILL_CLEARANCE, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { BarChart } from '@/components/ui/bar-chart'
import { createTokensV2 } from '@/lib/theme'
import { __focusHost, __getFocusedNativeTag, __setTouchMode } from '../../../test-mocks/react-native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const language = vi.hoisted(() => ({ locale: 'en' }))
const theme = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({ currentScheme: 'orange', currentTheme: 'dark' }))

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: createTranslator({ locale: language.locale, messages: language.locale === 'en' ? en : ptBR }) }),
}))

const loadGestureModule = createRequire(import.meta.url)
const { HoverGesture: InstalledHoverGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/hoverGesture') as { HoverGesture: new () => HoverGesture }
const { findHandler } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/handlersRegistry') as { findHandler: (tag: number) => HoverGesture | undefined }
const { State } = loadGestureModule('react-native-gesture-handler/lib/commonjs/State') as typeof import('react-native-gesture-handler/lib/typescript/State')
const { PointerType } = loadGestureModule('react-native-gesture-handler/lib/commonjs/PointerType') as typeof import('react-native-gesture-handler/lib/typescript/PointerType')

function loadInstalledReceiver() {
  const nativePath = loadGestureModule.resolve('react-native')
  const previous = loadGestureModule.cache[nativePath]
  const nativeModule = new Module(nativePath)
  nativeModule.exports = ReactNative
  loadGestureModule.cache[nativePath] = nativeModule
  try {
    return loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/eventReceiver') as {
      onGestureHandlerEvent: (event: GestureStateChangeEvent) => void
    }
  } finally {
    if (previous) loadGestureModule.cache[nativePath] = previous
    else delete loadGestureModule.cache[nativePath]
  }
}
const { onGestureHandlerEvent } = loadInstalledReceiver()

type HoverOwner = ReactTestInstance & { readonly parent: HoverOwner | null }

function attachedColumnHover(target: ReactTestInstance): HoverGesture {
  let detector = (target as HoverOwner).parent
  while (detector && typeof detector.type !== 'string') detector = detector.parent
  expect(detector?.type, 'native chart hover must wrap the complete radio target').toBe('GestureDetector')
  const child = React.Children.only(detector!.props.children) as React.ReactElement<{ accessibilityRole: string }>
  expect(child.type, 'hover must retain the existing native radio pressable').toBe(Pressable)
  expect(child.props.accessibilityRole).toBe('radio')
  expect(target.props.collapsable).toBe(false)
  const gesture = detector!.props.gesture as HoverGesture
  expect(gesture).toBeInstanceOf(InstalledHoverGesture)
  expect(gesture.handlerName).toBe('HoverGestureHandler')
  expect(gesture.handlerTag).toBeGreaterThan(0)
  expect(gesture.config).toMatchObject({ manualActivation: true, cancelsTouchesInView: false, runOnJS: true })
  expect(findHandler(gesture.handlerTag)).toBe(gesture)
  return gesture
}

function deliverHover(gesture: HoverGesture, state: typeof State[keyof typeof State], oldState: typeof State[keyof typeof State]) {
  void act(() => onGestureHandlerEvent({
    handlerTag: gesture.handlerTag, numberOfPointers: 1, pointerType: PointerType.MOUSE,
    x: 1, y: 16, absoluteX: 72, absoluteY: 32, state, oldState,
  }))
}

function fillStyle(target: ReactTestInstance) {
  return StyleSheet.flatten(host(target, 'bar-chart-fill').props.style) as ViewStyle
}

function barColor(target: ReactTestInstance) {
  return target.findAll((node) => String(node.type) === 'Path')[0]!.props.fill
}

function selectedSnapshot() {
  return {
    checked: radios().map((radio) => radio.props.accessibilityState),
    readout: host(tree.root, 'bar-chart-readout').props.children,
    focus: __getFocusedNativeTag(),
  }
}

const points = mapCompletionSeries({ granularity: 'day', points: Array.from({ length: 30 }, (_, index) => ({
  startDate: `2026-09-${String(index + 1).padStart(2, '0')}`, endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  completionRate: index === 0 ? null : index === 1 ? 0 : 50,
  scheduled: index === 0 ? 0 : 2, completed: index < 2 ? 0 : 1,
})) }, 'en')
let tree: ReturnType<typeof create>

function host(root: ReactTestInstance, testID: string) {
  return root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0]!
}
function radios() {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
}
function trigger(node: ReactTestInstance, name: string, event?: unknown) {
  void act(() => { (node.props[name] as (event?: unknown) => void)(event) })
}
function layout(node: ReactTestInstance, width: number) {
  trigger(node, 'onLayout', { nativeEvent: { layout: { width, height: 96, x: 0, y: 0 } } })
}
function geometryStyle(node: ReactTestInstance) {
  const declared = node.props.style
  return StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared) as { left: number; top: number; width: number; height: number }
}

function feedbackBounds(target: ReactTestInstance, feedback: ReactTestInstance) {
  const config = Yoga.Config.create()
  config.setPointScaleFactor(0)
  const parent = Yoga.Node.create(config)
  const child = Yoga.Node.create(config)
  const bounds = geometryStyle(target)
  const style = StyleSheet.flatten(feedback.props.style) as { left: number; top: number; width: number; height: number; borderWidth?: number }
  parent.setWidth(bounds.width)
  parent.setHeight(bounds.height)
  child.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  child.setPosition(Yoga.EDGE_LEFT, style.left)
  child.setWidth(style.width)
  child.setPosition(Yoga.EDGE_TOP, style.top)
  child.setHeight(style.height)
  child.setBorder(Yoga.EDGE_ALL, style.borderWidth ?? 0)
  parent.insertChild(child, 0)
  try {
    parent.calculateLayout(bounds.width, bounds.height, Yoga.DIRECTION_LTR)
    return child.getComputedLayout()
  } finally { parent.freeRecursive(); config.free() }
}

beforeEach(() => {
  language.locale = 'en'
  theme.currentTheme = 'dark'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 4, 12))
  void act(() => { tree = create(<BarChart points={points} label="Last 30 days" />) })
})
afterEach(() => { void act(() => tree.update(<></>)); vi.useRealTimers(); vi.restoreAllMocks(); __setTouchMode(true) })

describe('BarChart on Android', () => {
  it('paints feedback on the radio own bar without a column background', () => {
    layout(host(tree.root, 'bar-chart-control'), 288)
    const target = radios()[1]!
    trigger(target, 'onPressIn')
    const paths = target.findAll((node) => String(node.type) === 'Path')
    expect(paths).toHaveLength(1)
    expect(paths[0]!.props.fill).toBe(createTokensV2('orange', 'dark').fg1)
    expect(fillStyle(target).backgroundColor).toBe('transparent')
  })
  it('uses individually named radios, selects today and changes readout on press or accessibility action', () => {
    const options = radios()
    expect(options).toHaveLength(30)
    expect(options[3]!.props.accessibilityState).toEqual({ checked: true })
    expect(options[3]!.props.accessibilityLabel).toMatch(/Fri.*Sep.*4.*50%.*1 of 2/)
    trigger(options[1]!, 'onPress')
    expect(radios()[1]!.props.accessibilityState).toEqual({ checked: true })
    expect(radios()[1]!.props.accessibilityLabel).toMatch(/Wed.*0%.*0 of 2/)
    expect(host(tree.root, 'bar-chart-readout').props.children).toContain('0% · 0 of 2')
    trigger(radios()[1]!, 'onAccessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    expect(radios()[0]!.props.accessibilityState).toEqual({ checked: true })
    expect(radios()[0]!.props.accessibilityLabel).toContain('Nothing scheduled')
    trigger(radios()[0]!, 'onAccessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(radios()[1]!.props.accessibilityState).toEqual({ checked: true })
    trigger(radios()[4]!, 'onFocus')
    expect(radios()[4]!.props.accessibilityState).toEqual({ checked: true })
    expect(host(tree.root, 'bar-chart-readout').props.children).toContain('Sat')
  })

  it.each([
    { actionName: 'increment', start: 3, destinations: [4, 5] },
    { actionName: 'decrement', start: 3, destinations: [2, 1] },
    { actionName: 'increment', start: 28, destinations: [29, 0] },
    { actionName: 'decrement', start: 1, destinations: [0, 29] },
  ])('continues $actionName actions on radio $start from the current selection', ({ actionName, start, destinations }) => {
    const target = radios()[start]!
    trigger(target, 'onPress')
    for (const destination of destinations) {
      trigger(target, 'onAccessibilityAction', { nativeEvent: { actionName } })
      const selected = radios()[destination]!
      expect(radios().map((radio) => radio.props.accessibilityState)).toEqual(points.map((_, index) => ({ checked: index === destination })))
      expect(host(tree.root, 'bar-chart-readout').props.children).toBe(selected.props.accessibilityLabel)
      expect(radios()[start]).toBe(target)
    }
  })

  it.each([320, 412])('tiles the %i plot with full-height targets and clamps both edge readouts', (width) => {
    const plot = host(tree.root, 'bar-chart-control')
    layout(plot, width)
    const plotStyle = geometryStyle(plot)
    const targetStyles = radios().map(geometryStyle)
    const plotNode = Yoga.Node.create()
    plotNode.setWidth(width)
    plotNode.setHeight(plotStyle.height)
    for (const target of targetStyles) {
      const node = Yoga.Node.create()
      node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
      node.setPosition(Yoga.EDGE_LEFT, target.left)
      node.setPosition(Yoga.EDGE_TOP, target.top)
      node.setWidth(target.width)
      node.setHeight(target.height)
      plotNode.insertChild(node, plotNode.getChildCount())
    }
    try {
      plotNode.calculateLayout(width, plotStyle.height, Yoga.DIRECTION_LTR)
      let previousEnd = 0
      for (let index = 0; index < plotNode.getChildCount(); index++) {
        const bounds = plotNode.getChild(index).getComputedLayout()
        expect(bounds.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
        expect(bounds.left).toBe(previousEnd)
        expect(bounds.left + bounds.width).toBeLessThanOrEqual(width)
        expect(bounds.top).toBe(0)
        previousEnd = bounds.left + bounds.width
      }
      expect(previousEnd).toBe(width)
    } finally { plotNode.freeRecursive() }
    expect(plotStyle.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
    layout(host(tree.root, 'bar-chart-readout'), 240)
    for (const index of [0, 29]) {
      trigger(radios()[index]!, 'onPress')
      const readout = host(tree.root, 'bar-chart-readout')
      const style = geometryStyle(readout)
      expect(style.left).toBeGreaterThanOrEqual(0)
      expect(style.left + 240).toBeLessThanOrEqual(width)
    }
    const paths = tree.root.findAll((node) => String(node.type) === 'Path')
    expect(paths[0]!.props.d).toContain(String(96 - INTERACTION_FILL_CLEARANCE))
    expect(paths[1]!.props.d).toContain(String(96 - INTERACTION_FILL_CLEARANCE))
    expect(new Set(paths.map((path) => path.props.fill)).size).toBe(2)
  })

  it.each([288, 380, 1320].flatMap((width) => [0, 50, 100].map((rate) => ({ width, rate }))))('contains feedback on its $rate percent bar at $width', ({ width, rate }) => {
    void act(() => tree.update(<BarChart points={points.map((point) => ({ ...point, rate }))} label="Completion" />))
    layout(host(tree.root, 'bar-chart-control'), width)
    const target = radios()[1]!
    const bar = target.findAll((node) => String(node.type) === 'Path')[0]!
    const before = bar.props.d
    const hover = attachedColumnHover(target)
    deliverHover(hover, State.BEGAN, State.UNDETERMINED)
    expect(barColor(target)).toBe(createTokensV2('orange', 'dark').fg1)
    deliverHover(hover, State.FAILED, State.BEGAN)
    trigger(target, 'onPressIn')
    expect(barColor(target)).toBe(createTokensV2('orange', 'dark').fg1)
    expect(fillStyle(target).backgroundColor).toBe('transparent')
    expect(bar.props.d).toBe(before)
    const mark = feedbackBounds(target, host(target, 'bar-chart-fill'))
    trigger(target, 'onPressOut')
    trigger(target, 'onFocus')
    expect(mark.width).toBeGreaterThan(0)
    expect(StyleSheet.flatten(host(tree.root, 'bar-chart-readout').props.style)).toMatchObject({ borderWidth: 2, borderColor: createTokensV2('orange', 'dark').fg1 })
  })

  it.each(['en', 'pt-BR'] as const)('retains complete weekly ranges and values in %s', (locale) => {
    language.locale = locale
    const weekly = mapCompletionSeries({ granularity: 'week', points: [
      { startDate: '2026-09-07', endDate: '2026-09-13', scheduled: 0, completed: 0, completionRate: null },
      { startDate: '2026-09-28', endDate: '2026-09-30', scheduled: 2, completed: 1, completionRate: 50 },
    ] }, locale)
    void act(() => tree.update(<BarChart points={weekly} label="Period" />))
    expect(radios()[1]!.props.accessibilityLabel).toContain(weekly[1]!.readoutDateLabel)
    expect(radios()[1]!.props.accessibilityLabel).toContain(locale === 'en' ? '50% · 1 of 2' : '50% · 1 de 2')
    layout(host(tree.root, 'bar-chart-control'), 320)
    layout(host(tree.root, 'bar-chart-readout'), 320)
    expect(geometryStyle(host(tree.root, 'bar-chart-readout')).left).toBe(0)
    trigger(radios()[0]!, 'onPress')
    expect(host(tree.root, 'bar-chart-readout').props.children).toContain(weekly[0]!.readoutDateLabel)
    expect(radios()[0]!.props.accessibilityLabel).toContain(locale === 'en' ? 'Nothing scheduled' : 'Nada programado')
  })

  it.each([{ count: 53, width: 240 }, { count: 30, width: 288 }, { count: 240, width: 240 }, { count: 53, width: 1 }])('keeps press and focus visible for $count points in $width pixels', ({ count, width }) => {
    const compactPoints = mapCompletionSeries({ granularity: 'week', points: Array.from({ length: count }, (_, index) => ({
      startDate: new Date(Date.UTC(2025, 0, 1 + index * 7)).toISOString().slice(0, 10),
      endDate: new Date(Date.UTC(2025, 0, 7 + index * 7)).toISOString().slice(0, 10),
      scheduled: 4, completed: 2, completionRate: 50,
    })) }, 'en')
    void act(() => tree.update(<BarChart points={compactPoints} label="Completion" />))
    layout(host(tree.root, 'bar-chart-control'), width)
    const target = radios()[Math.floor(count / 2)]!
    trigger(target, 'onPressIn')
    const feedback = host(target, 'bar-chart-fill')
    expect(fillStyle(target).backgroundColor).toBe('transparent')
    expect(barColor(target)).toBe(createTokensV2('orange', 'dark').fg1)
    const mark = feedbackBounds(target, feedback)
    expect(mark.width).toBeGreaterThan(0)
    expect(mark.left).toBeGreaterThanOrEqual(0)
    expect(mark.left + mark.width).toBeLessThanOrEqual(geometryStyle(target).width + 0.0001)
    trigger(target, 'onPressOut')
    trigger(target, 'onFocus')
    const readout = StyleSheet.flatten(host(tree.root, 'bar-chart-readout').props.style) as ViewStyle
    expect(readout).toMatchObject({ borderWidth: 2, padding: 8 })
  })

  it('keeps selection valid across a reduced or empty series', () => {
    trigger(radios()[29]!, 'onPress')
    void act(() => tree.update(<BarChart points={points.slice(0, 2)} label="Last 30 days" />))
    expect(radios()[1]!.props.accessibilityState).toEqual({ checked: true })
    void act(() => tree.update(<BarChart points={[]} label="Last 30 days" />))
    expect(radios()).toHaveLength(0)
  })
})

function chartInteractions(mode: 'dark' | 'light', locale: 'en' | 'pt-BR') {
  theme.currentTheme = mode
  language.locale = locale
  const localizedPoints = mapCompletionSeries({ granularity: 'day', points: points.map((point) => ({
    startDate: point.startDate, endDate: point.endDate, scheduled: point.scheduled,
    completed: point.completed, completionRate: point.rate,
  })) }, locale)
  void act(() => tree.update(<BarChart points={localizedPoints} label="Completion" />))
  layout(host(tree.root, 'bar-chart-control'), 320)
  const target = radios()[1]!
  const other = radios()[2]!
  const hover = attachedColumnHover(target)
  const otherHover = attachedColumnHover(other)
  expect(otherHover).not.toBe(hover)
  const palette = createTokensV2('orange', mode)
  return { target, other, hover, otherHover, palette, localizedPoints }
}

describe.each(['dark', 'light'] as const)('Native chart hover in %s', (mode) => {
  it.each(['en', 'pt-BR'] as const)('paints only the hovered column without selection, focus or announcements in %s', (locale) => {
    const view = chartInteractions(mode, locale)
    const before = selectedSnapshot()
    const bounds = geometryStyle(view.target)
    const paths = () => tree.root.findAll((node) => String(node.type) === 'Path').map((node) => node.props)
    const initialPaths = paths().map(path => path.d)
    for (let cycle = 0; cycle < 3; cycle++) {
      deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
      expect(barColor(view.target)).toBe(view.palette.fg1)
      expect(barColor(view.other)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
      expect(geometryStyle(view.target)).toEqual(bounds)
      expect(fillStyle(view.target).backgroundColor).toBe('transparent')
      expect(fillStyle(view.target).transform).toBeUndefined()
      expect(selectedSnapshot()).toEqual(before)
      expect(paths().map(path => path.d)).toEqual(initialPaths)
      expect(attachedColumnHover(view.target)).toBe(view.hover)
      deliverHover(view.hover, State.FAILED, State.BEGAN)
      expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    }
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')).toHaveLength(1)
  })

  it.each(['en', 'pt-BR'] as const)('retains hover through release and held press through terminal cleanup in %s', (locale) => {
    const view = chartInteractions(mode, locale)
    const before = selectedSnapshot()
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    trigger(view.target, 'onPressIn')
    trigger(view.target, 'onPressOut')
    expect(barColor(view.target)).toBe(view.palette.fg1)
    trigger(view.target, 'onPressIn')
    deliverHover(view.hover, State.FAILED, State.BEGAN)
    expect(barColor(view.target)).toBe(view.palette.fg1)
    expect((StyleSheet.flatten(view.target.props.style) as ViewStyle).transform).toBeUndefined()
    trigger(view.target, 'onPressOut')
    expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(selectedSnapshot()).toEqual(before)
  })

  it.each([State.END, State.CANCELLED, State.FAILED])('clears only its hover reason for terminal state %s', (terminal) => {
    const view = chartInteractions(mode, 'en')
    const before = selectedSnapshot()
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    deliverHover(view.otherHover, State.BEGAN, State.UNDETERMINED)
    deliverHover(view.hover, terminal, State.BEGAN)
    expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(barColor(view.other)).toBe(view.palette.fg1)
    trigger(view.target, 'onPressIn')
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    deliverHover(view.hover, terminal, State.BEGAN)
    expect(barColor(view.target)).toBe(view.palette.fg1)
    trigger(view.target, 'onPressOut')
    deliverHover(view.otherHover, terminal, State.BEGAN)
    expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(barColor(view.other)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(selectedSnapshot()).toEqual(before)
  })

  it.each(['en', 'pt-BR'] as const)('keeps keyboard selection and one contained focus perimeter independent of hover in %s', (locale) => {
    const view = chartInteractions(mode, locale)
    const rings = () => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'bar-chart-readout' && (StyleSheet.flatten(node.props.style) as ViewStyle).borderColor !== 'transparent')
    __setTouchMode(false)
    void act(() => { __focusHost(view.target.props.__nativeTag as number) })
    const focused = selectedSnapshot()
    expect(focused.readout).toBe(view.target.props.accessibilityLabel)
    expect(radios()[1]!.props.accessibilityState).toEqual({ checked: true })
    expect(rings()).toHaveLength(1)
    expect(barColor(view.target)).toBe(view.palette.fg1)
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    deliverHover(view.hover, State.CANCELLED, State.BEGAN)
    expect(selectedSnapshot()).toEqual(focused)
    expect(rings()).toHaveLength(1)
    expect(rings()[0]!.props.testID).toBe('bar-chart-readout')
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    trigger(view.target, 'onPressIn')
    void act(() => { __focusHost(view.other.props.__nativeTag as number) })
    expect(rings()).toHaveLength(1)
    expect(barColor(view.target)).toBe(view.palette.fg1)
    expect(host(tree.root, 'bar-chart-readout').props.children).toBe(view.other.props.accessibilityLabel)
    deliverHover(view.hover, State.FAILED, State.BEGAN)
    expect(barColor(view.target)).toBe(view.palette.fg1)
    trigger(view.target, 'onPressOut')
    expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(attachedColumnHover(view.target)).toBe(view.hover)
  })

  it.each(['en', 'pt-BR'] as const)('keeps touch cancellation inert and activation on its original radio in %s', (locale) => {
    const view = chartInteractions(mode, locale)
    const before = selectedSnapshot()
    trigger(view.target, 'onPressIn')
    expect(barColor(view.target)).toBe(view.palette.fg1)
    trigger(view.target, 'onPressOut')
    expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(selectedSnapshot()).toEqual(before)
    trigger(view.target, 'onPressIn')
    trigger(view.target, 'onPressOut')
    trigger(view.target, 'onPress')
    expect(radios().map((radio) => radio.props.accessibilityState)).toEqual(points.map((_, index) => ({ checked: index === 1 })))
    expect(host(tree.root, 'bar-chart-readout').props.children).toBe(view.target.props.accessibilityLabel)
    expect(barColor(view.target)).toBe(view.palette.fg1)
    expect(attachedColumnHover(view.target)).toBe(view.hover)
  })
})

describe('Native chart hover lifecycle and geometry', () => {
  it.each([{ count: 30, width: 288 }, { count: 53, width: 240 }, { count: 240, width: 240 }, { count: 53, width: 1 }])('preserves hover and handler identity across layout and point updates at $count/$width', ({ count, width }) => {
    const series = mapCompletionSeries({ granularity: 'week', points: Array.from({ length: count }, (_, index) => ({
      startDate: new Date(Date.UTC(2025, 0, 1 + index * 7)).toISOString().slice(0, 10),
      endDate: new Date(Date.UTC(2025, 0, 7 + index * 7)).toISOString().slice(0, 10),
      scheduled: 4, completed: 2, completionRate: 50,
    })) }, 'en')
    void act(() => tree.update(<BarChart points={series} label="Completion" />))
    layout(host(tree.root, 'bar-chart-control'), width)
    const index = Math.floor(count / 2)
    const target = radios()[index]!
    const hover = attachedColumnHover(target)
    const tag = hover.handlerTag
    const before = selectedSnapshot()
    deliverHover(hover, State.BEGAN, State.UNDETERMINED)
    expect(barColor(target)).toBe(createTokensV2('orange', 'dark').fg1)
    const bounds = feedbackBounds(target, host(target, 'bar-chart-fill'))
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(geometryStyle(target).width + 0.0001)
    expect(selectedSnapshot()).toEqual(before)
    layout(host(tree.root, 'bar-chart-control'), width / 2)
    layout(host(tree.root, 'bar-chart-readout'), width / 2)
    void act(() => tree.update(<BarChart points={series.map((point) => ({ ...point, rate: 100 }))} label="Updated completion" />))
    expect(radios()[index]).toBe(target)
    expect(attachedColumnHover(target)).toBe(hover)
    expect(hover.handlerTag).toBe(tag)
    expect(barColor(target)).toBe(createTokensV2('orange', 'dark').fg1)
    deliverHover(hover, State.END, State.BEGAN)
    expect(barColor(target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
  })

  it('unregisters removed dates, keeps surviving dates stable and ignores stale tags after remount', () => {
    const view = chartInteractions('dark', 'en')
    const oldTag = view.hover.handlerTag
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    const remaining = view.localizedPoints.filter((_, index) => index !== 1)
    void act(() => tree.update(<BarChart points={remaining} label="Completion" />))
    expect(findHandler(oldTag)).toBeUndefined()
    expect(attachedColumnHover(radios()[1]!)).toBe(view.otherHover)
    const before = selectedSnapshot()
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    deliverHover(view.hover, State.FAILED, State.BEGAN)
    expect(selectedSnapshot()).toEqual(before)
    expect(barColor(radios()[1]!)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    void act(() => tree.update(<BarChart points={view.localizedPoints} label="Completion" />))
    const replacement = radios()[1]!
    const fresh = attachedColumnHover(replacement)
    expect(fresh).not.toBe(view.hover)
    expect(fresh.handlerTag).not.toBe(oldTag)
    const restored = selectedSnapshot()
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    expect(barColor(replacement)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(selectedSnapshot()).toEqual(restored)
    const gestures = radios().map(attachedColumnHover)
    void act(() => tree.update(<BarChart points={[]} label="Completion" />))
    expect(radios()).toHaveLength(0)
    for (const gesture of gestures) expect(findHandler(gesture.handlerTag)).toBeUndefined()
    deliverHover(fresh, State.BEGAN, State.UNDETERMINED)
    void act(() => tree.update(<BarChart points={view.localizedPoints} label="Completion" />))
    expect(barColor(radios()[1]!)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
    expect(attachedColumnHover(radios()[1]!).handlerTag).not.toBe(fresh.handlerTag)
  })

  it.each([false, true])('keeps hover and held press static with reduced motion %s', (reduced) => {
    vi.spyOn(ReactNative.AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced)
    const view = chartInteractions('dark', 'en')
    deliverHover(view.hover, State.BEGAN, State.UNDETERMINED)
    trigger(view.target, 'onPressIn')
    expect(barColor(view.target)).toBe(view.palette.fg1)
    for (const node of [view.target, host(view.target, 'bar-chart-fill')]) {
      const style = StyleSheet.flatten(node.props.style) as ViewStyle
      expect(style.transform).toBeUndefined()
      expect(style.opacity).toBeUndefined()
    }
    trigger(view.target, 'onPressOut')
    expect(barColor(view.target)).toBe(view.palette.fg1)
    deliverHover(view.hover, State.FAILED, State.BEGAN)
    expect(barColor(view.target)).toBe(createTokensV2('orange', theme.currentTheme).fg2)
  })
})

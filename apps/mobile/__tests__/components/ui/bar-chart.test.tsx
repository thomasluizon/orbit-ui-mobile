import { act, create } from 'react-test-renderer'
import type { ReactTestInstance } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { INTERACTION_FILL_CLEARANCE, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { BarChart } from '@/components/ui/bar-chart'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const language = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: createTranslator({ locale: language.locale, messages: language.locale === 'en' ? en : ptBR }) }),
}))

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
  const style = StyleSheet.flatten(feedback.props.style) as { left: number; right: number; top: number; bottom: number; borderWidth?: number }
  parent.setWidth(bounds.width)
  parent.setHeight(bounds.height)
  child.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  child.setPosition(Yoga.EDGE_LEFT, style.left)
  child.setPosition(Yoga.EDGE_RIGHT, style.right)
  child.setPosition(Yoga.EDGE_TOP, style.top)
  child.setPosition(Yoga.EDGE_BOTTOM, style.bottom)
  child.setBorder(Yoga.EDGE_ALL, style.borderWidth ?? 0)
  parent.insertChild(child, 0)
  try {
    parent.calculateLayout(bounds.width, bounds.height, Yoga.DIRECTION_LTR)
    return child.getComputedLayout()
  } finally { parent.freeRecursive(); config.free() }
}

beforeEach(() => {
  language.locale = 'en'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 4, 12))
  void act(() => { tree = create(<BarChart points={points} label="Last 30 days" />) })
})
afterEach(() => { void act(() => tree.update(<></>)); vi.useRealTimers() })

describe('BarChart on Android', () => {
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
    expect(paths[0]!.props.d).toContain('88')
    expect(paths[1]!.props.d).toContain('88')
    expect(new Set(paths.map((path) => path.props.fill)).size).toBe(2)
  })

  it.each([288, 380, 1320].flatMap((width) => [0, 50, 100].map((rate) => ({ width, rate }))))('keeps pressed fill clear of its $rate percent bar at $width', ({ width, rate }) => {
    void act(() => tree.update(<BarChart points={points.map((point) => ({ ...point, rate }))} label="Completion" />))
    layout(host(tree.root, 'bar-chart-control'), width)
    const target = radios()[1]!
    trigger(target, 'onPressIn')
    const feedback = target.findAll((node) => typeof node.type === 'string' && node.props.pointerEvents === 'none')[0]!
    const fill = StyleSheet.flatten(feedback.props.style) as { backgroundColor: string; top: number; bottom: number; left: number; right: number }
    expect(fill.backgroundColor).not.toBe('transparent')
    const path = tree.root.findAll((node) => String(node.type) === 'Path')[1]!
    const numbers = String(path.props.d).match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const bottom = numbers[1]!
    const top = numbers[4]!
    expect(top - fill.top).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    expect(geometryStyle(target).height - fill.bottom - bottom).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    const targetBounds = geometryStyle(target)
    const paths = tree.root.findAll((node) => String(node.type) === 'Path')
    const previous = String(paths[0]!.props.d).match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const next = String(paths[2]!.props.d).match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    expect(targetBounds.left + fill.left - previous[8]!).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE - 0.001)
    expect(next[0]! - targetBounds.left - targetBounds.width + fill.right).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE - 0.001)
    trigger(target, 'onPressOut')
    trigger(target, 'onFocus')
    const ring = target.findAll((node) => typeof node.type === 'string' && node.props.pointerEvents === 'none')[1]!
    const focus = StyleSheet.flatten(ring.props.style) as { left: number; right: number; borderWidth: number }
    expect(focus).toMatchObject({ left: fill.left, right: fill.right, borderWidth: 2 })
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
    const fill = StyleSheet.flatten(feedback.props.style) as { left: number; right: number; backgroundColor: string }
    const targetBounds = geometryStyle(target)
    const paths = tree.root.findAll((node) => String(node.type) === 'Path')
    const pathBounds = paths.map((path) => String(path.props.d).match(/-?\d+(?:\.\d+)?/g)!.map(Number))
    const index = Math.floor(count / 2)
    const barWidth = pathBounds[index]![8]! - pathBounds[index]![0]!
    expect(fill.backgroundColor).not.toBe('transparent')
    expect(targetBounds.width - fill.left - fill.right).toBeGreaterThan(barWidth)
    expect(targetBounds.left + fill.left).toBeGreaterThan(pathBounds[index - 1]![8]!)
    expect(targetBounds.left + targetBounds.width - fill.right).toBeLessThan(pathBounds[index + 1]![0]!)
    trigger(target, 'onPressOut')
    trigger(target, 'onFocus')
    const ring = target.findAll((node) => typeof node.type === 'string' && node.props.pointerEvents === 'none')[1]!
    const focus = StyleSheet.flatten(ring.props.style) as { left: number; right: number; borderWidth: number }
    const measured = feedbackBounds(target, ring)
    expect(measured.width).toBeGreaterThan(barWidth)
    expect(measured.left).toBeGreaterThanOrEqual(0)
    expect(measured.left + measured.width).toBeLessThanOrEqual(targetBounds.width + 0.0001)
    expect(targetBounds.left + measured.left).toBeGreaterThan(pathBounds[index - 1]![8]!)
    expect(targetBounds.left + measured.left + measured.width).toBeLessThan(pathBounds[index + 1]![0]!)
    expect(focus.borderWidth).toBeGreaterThan(0)
    expect(focus.borderWidth).toBeLessThanOrEqual(2)
  })

  it('keeps selection valid across a reduced or empty series', () => {
    trigger(radios()[29]!, 'onPress')
    void act(() => tree.update(<BarChart points={points.slice(0, 2)} label="Last 30 days" />))
    expect(radios()[1]!.props.accessibilityState).toEqual({ checked: true })
    void act(() => tree.update(<BarChart points={[]} label="Last 30 days" />))
    expect(radios()).toHaveLength(0)
  })
})

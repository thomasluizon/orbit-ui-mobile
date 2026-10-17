import { act, create } from 'react-test-renderer'
import type { ReactTestInstance } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
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
    expect(paths[0]!.props.d).toContain('92')
    expect(paths[1]!.props.d).toContain('92')
    expect(new Set(paths.map((path) => path.props.fill)).size).toBe(2)
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

  it('keeps selection valid across a reduced or empty series', () => {
    trigger(radios()[29]!, 'onPress')
    void act(() => tree.update(<BarChart points={points.slice(0, 2)} label="Last 30 days" />))
    expect(radios()[1]!.props.accessibilityState).toEqual({ checked: true })
    void act(() => tree.update(<BarChart points={[]} label="Last 30 days" />))
    expect(radios()).toHaveLength(0)
  })
})

import React from 'react'
import { Pressable, StyleSheet, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateField } from '@/components/ui/date-field'
import { Sheet } from '@/components/ui/sheet'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { buildYearRange } from '@orbit/shared/utils'
import { __resetTestHostConfig, __setWindowDimensions, __setScrollToImpl } from '../../../test-mocks/react-native'

vi.unmock('@/components/ui/date-field')
vi.unmock('@/components/ui/sheet')
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = vi.fn(() => Promise.resolve())
    render() { return this.props.children }
  },
}))

const TestRenderer = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
interface HostJson {
  type: string
  props: Record<string, unknown>
  children: (HostJson | string)[] | null
}

const BODY_INSETS_BY_WIDTH = new Map([
  [320, 4], [324, 8], [332, 12], [339, 12], [340, 16], [344, 16],
  [352, 16], [355, 16], [356, 24], [412, 24], [640, 24], [915, 24],
])

function applyBoxSize(node: YogaNode, style: ViewStyle) {
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.width === 'string' && style.width.endsWith('%')) node.setWidthPercent(parseFloat(style.width))
  if (typeof style.maxHeight === 'number') node.setMaxHeight(style.maxHeight)
  if (typeof style.flexShrink === 'number') node.setFlexShrink(style.flexShrink)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (typeof style.marginBottom === 'number') node.setMargin(Yoga.EDGE_BOTTOM, style.marginBottom)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.height === 'number') node.setHeight(style.height)
}

function applyAlignment(node: YogaNode, style: ViewStyle) {
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.justifyContent === 'space-around') node.setJustifyContent(Yoga.JUSTIFY_SPACE_AROUND)
  if (style.justifyContent === 'space-between') node.setJustifyContent(Yoga.JUSTIFY_SPACE_BETWEEN)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  for (const [key, edge] of [['paddingHorizontal', Yoga.EDGE_HORIZONTAL], ['paddingTop', Yoga.EDGE_TOP], ['paddingBottom', Yoga.EDGE_BOTTOM]] as const) {
    if (typeof style[key] === 'number') node.setPadding(edge, style[key])
  }
}

function buildLayout(element: HostJson, targets: YogaNode[], scrollNodes?: Map<string, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  if (scrollNodes && element.type === 'ScrollView') {
    const style = StyleSheet.flatten(element.props.style as ViewStyle)
    node.setFlexGrow(1)
    node.setFlexShrink(1)
    if (typeof style.maxHeight === 'number') node.setMaxHeight(style.maxHeight)
    node.setOverflow(Yoga.OVERFLOW_SCROLL)
    node.insertChild(buildLayout({ ...element, type: 'View', props: { style: element.props.contentContainerStyle } }, targets, scrollNodes), 0)
    scrollNodes.set(String(element.props.testID), node)
    return node
  }
  const declaredStyle = element.props.contentContainerStyle ?? element.props.style
  const resolvedStyle = typeof declaredStyle === 'function' ? declaredStyle({ pressed: false }) : declaredStyle
  const style = StyleSheet.flatten((resolvedStyle ?? {}) as ViewStyle)
  applyBoxSize(node, style)
  applyAlignment(node, style)
  const state = element.props.accessibilityState as { selected?: boolean } | undefined
  if (element.type === 'Pressable' && typeof state?.selected === 'boolean') targets.push(node)
  const children = (element.children ?? []).filter((child): child is HostJson => typeof child !== 'string')
  children.forEach((child, index) => node.insertChild(buildLayout(child, targets, scrollNodes), index))
  return node
}

function leftWithin(node: YogaNode, body: YogaNode): number {
  let left = 0
  let current: YogaNode | null = node
  while (current && current !== body) {
    left += current.getComputedLeft()
    current = current.getParent()
  }
  return left
}

function findHost(elements: HostJson[], testID: string): HostJson | undefined {
  for (const element of elements) {
    if (element.props.testID === testID) return element
    const found = findHost((element.children ?? []).filter((child): child is HostJson => typeof child !== 'string'), testID)
    if (found) return found
  }
}

function assertCalendarFits(tree: ReturnType<typeof TestRenderer.create>, width: number) {
  const scroll = tree.root.findByProps({ testID: 'sheet-body-scroll' })
  const host = tree.toJSON() as HostJson[]
  const targets: YogaNode[] = []
  const body = buildLayout(findHost(host, 'sheet-body-scroll')!, targets)
  try {
    body.calculateLayout(Math.min(width, 640), undefined)
    const leftEdge = body.getComputedPadding(Yoga.EDGE_LEFT)
    const rightEdge = body.getComputedWidth() - body.getComputedPadding(Yoga.EDGE_RIGHT)
    expect(targets).toHaveLength(42)
    expect([24, 16, 12, 8, 4]).toContain(leftEdge)
    expect(body.getComputedPadding(Yoga.EDGE_RIGHT)).toBe(leftEdge)
    expect(leftEdge).toBe(BODY_INSETS_BY_WIDTH.get(width))
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(24)
    for (const target of targets) {
      expect(target.getComputedWidth()).toBeGreaterThanOrEqual(44)
      expect(target.getComputedHeight()).toBeGreaterThanOrEqual(44)
      expect(leftWithin(target, body)).toBeGreaterThanOrEqual(leftEdge - 0.01)
      expect(leftWithin(target, body) + target.getComputedWidth()).toBeLessThanOrEqual(rightEdge + 0.01)
    }
    if (width >= 356) expect(leftEdge).toBe(24)
  } finally { body.freeRecursive() }
}

describe('DateField sheet geometry (mobile)', () => {
  afterEach(__resetTestHostConfig)
  it.each([...BODY_INSETS_BY_WIDTH.keys()])('keeps all seven 44px columns inside the body at %ipx', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = TestRenderer.create(<DateField value="2025-06-15" onChange={vi.fn()} />); await Promise.resolve() })
    try {
      await TestRenderer.act(async () => { tree.root.findByType(Pressable).props.onPress(); await Promise.resolve() })
      assertCalendarFits(tree, width)
    } finally { await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() }) }
  })

  it.each([320, 412])('bounds the single year scroller in a %ipx tall Android window', async (height) => {
    __setWindowDimensions({ width: 640, height, scale: 1, fontScale: 1 })
    const onChange = vi.fn()
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = TestRenderer.create(<DateField value="2025-06-15" onChange={onChange} />); await Promise.resolve() })
    try {
      await TestRenderer.act(async () => { tree.root.findByType(Pressable).props.onPress(); await Promise.resolve() })
      await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'common.selectYear' }).props.onPress(); await Promise.resolve() })
      expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
      TestRenderer.act(() => {
        tree.root.findByType(TrueSheet).props.header.props.onLayout({ nativeEvent: { layout: { height: 56 } } })
      })
      const bodyInstance = tree.root.findByProps({ testID: 'sheet-virtualized-body' })
      const bodyStyle = StyleSheet.flatten(bodyInstance.props.style)
      const yearScroll = tree.root.findByProps({ testID: 'year-picker-scroll' })
      const bodyHost = findHost(tree.toJSON() as HostJson[], 'sheet-virtualized-body')!
      const targets: YogaNode[] = []
      const scrollNodes = new Map<string, YogaNode>()
      const body = buildLayout(bodyHost, targets, scrollNodes)
      const viewport = scrollNodes.get('year-picker-scroll')!
      const content = viewport.getChild(0)
      try {
        body.calculateLayout(640, undefined)
        const viewportHeight = viewport.getComputedHeight()
        expect(viewportHeight).toBeGreaterThanOrEqual(48)
        expect(viewport.getComputedTop() + viewportHeight).toBeLessThanOrEqual(body.getComputedHeight() - bodyStyle.paddingBottom)
        const years = buildYearRange(2025)
        expect(targets).toHaveLength(years.length)
        expect(targets[3]!.getComputedTop() - targets[0]!.getComputedTop()).toBe(52)
        TestRenderer.act(() => {
          yearScroll.props.onLayout({ nativeEvent: { layout: { height: viewportHeight } } })
          yearScroll.props.onContentSizeChange(592, content.getComputedHeight())
        })
        const selected = targets[years.indexOf(2025)]!
        const selectedOffset = scrollTo.mock.calls.at(-1)![0].y
        expect(selected.getComputedTop() - selectedOffset).toBeGreaterThanOrEqual(0)
        expect(selected.getComputedTop() - selectedOffset + selected.getComputedHeight()).toBeLessThanOrEqual(viewportHeight)
        for (const index of [0, years.length - 1]) {
          const target = targets[index]!
          const offset = index === 0 ? 0 : content.getComputedHeight() - viewportHeight
          expect(target.getComputedWidth()).toBeGreaterThanOrEqual(48)
          expect(target.getComputedHeight()).toBe(48)
          expect(target.getComputedTop() - offset).toBeGreaterThanOrEqual(0)
          expect(target.getComputedTop() - offset + target.getComputedHeight()).toBeLessThanOrEqual(viewportHeight)
        }
      } finally { body.freeRecursive() }
      TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'common.selectYear' }).props.onPress())
      expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
      expect(tree.root.findByProps({ testID: 'sheet-body-scroll' })).toBeDefined()
      const originalDay = tree.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'June 15, 2025')!
      expect(originalDay.props.accessibilityState.selected).toBe(true)
      TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'common.selectYear' }).props.onPress())
      TestRenderer.act(() => tree.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === '2030')!.props.onPress())
      expect(onChange).not.toHaveBeenCalled()
      expect(tree.root.findAllByType('ScrollView')).toHaveLength(1)
      TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'common.previousMonth' }).props.onPress())
      TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'common.nextMonth' }).props.onPress())
      const day = tree.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'June 15, 2030')!
      expect(day).toBeDefined()
      await TestRenderer.act(async () => { day.props.onPress(); await Promise.resolve() })
      expect(onChange).not.toHaveBeenCalled()
      await TestRenderer.act(async () => { tree.root.findByType(TrueSheet).props.onDidDismiss(); await Promise.resolve() })
      expect(onChange).toHaveBeenCalledWith('2030-06-15')
      expect(tree.root.findAllByType(TrueSheet)).toHaveLength(0)
    } finally { await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() }) }
  })

  it('reflows an open date sheet when an Android window narrows and expands', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = TestRenderer.create(<DateField value="2025-06-15" onChange={vi.fn()} />); await Promise.resolve() })
    try {
      await TestRenderer.act(async () => { tree.root.findByType(Pressable).props.onPress(); await Promise.resolve() })
      for (const width of [412, 344, 320, 412]) {
        __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
        await TestRenderer.act(async () => { tree.update(<DateField value="2025-06-15" onChange={vi.fn()} />); await Promise.resolve() })
        assertCalendarFits(tree, width)
      }
    } finally { await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() }) }
  })

  it('keeps ordinary sheet content on the canonical 24px inset in a narrow window', async () => {
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 1 })
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = TestRenderer.create(<Sheet title="Title"><React.Fragment /></Sheet>); await Promise.resolve() })
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'sheet-body-scroll' }).props.contentContainerStyle).paddingHorizontal).toBe(24)
    await TestRenderer.act(async () => { tree.unmount(); await Promise.resolve() })
  })
})

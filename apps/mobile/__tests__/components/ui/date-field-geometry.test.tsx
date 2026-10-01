import React from 'react'
import { Pressable, StyleSheet, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateField } from '@/components/ui/date-field'
import { Sheet } from '@/components/ui/sheet'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

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

function buildLayout(element: HostJson, targets: YogaNode[]): YogaNode {
  const node = Yoga.Node.create()
  const declaredStyle = element.props.contentContainerStyle ?? element.props.style
  const resolvedStyle = typeof declaredStyle === 'function' ? declaredStyle({ pressed: false }) : declaredStyle
  const style = StyleSheet.flatten((resolvedStyle ?? {}) as ViewStyle)
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.justifyContent === 'space-around') node.setJustifyContent(Yoga.JUSTIFY_SPACE_AROUND)
  if (style.justifyContent === 'space-between') node.setJustifyContent(Yoga.JUSTIFY_SPACE_BETWEEN)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  for (const [key, edge] of [['paddingHorizontal', Yoga.EDGE_HORIZONTAL], ['paddingTop', Yoga.EDGE_TOP], ['paddingBottom', Yoga.EDGE_BOTTOM]] as const) {
    if (typeof style[key] === 'number') node.setPadding(edge, style[key])
  }
  const state = element.props.accessibilityState as { selected?: boolean } | undefined
  if (element.type === 'Pressable' && typeof state?.selected === 'boolean') targets.push(node)
  const children = (element.children ?? []).filter((child): child is HostJson => typeof child !== 'string')
  children.forEach((child, index) => node.insertChild(buildLayout(child, targets), index))
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

function assertCalendarFits(tree: ReturnType<typeof TestRenderer.create>, width: number) {
  const scroll = tree.root.findByProps({ testID: 'sheet-body-scroll' })
  const host = tree.toJSON() as HostJson[]
  const findBody = (elements: HostJson[]): HostJson | undefined => {
    for (const element of elements) {
      if (element.type === 'ScrollView' && element.props.testID === 'sheet-body-scroll') return element
      const found = findBody((element.children ?? []).filter((child): child is HostJson => typeof child !== 'string'))
      if (found) return found
    }
  }
  const targets: YogaNode[] = []
  const body = buildLayout(findBody(host)!, targets)
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

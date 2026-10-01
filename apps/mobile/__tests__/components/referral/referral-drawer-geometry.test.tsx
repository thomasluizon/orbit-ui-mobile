import React from 'react'
import { StyleSheet } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

vi.unmock('@/components/ui/sheet')
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: () => { throw new Error('denied') } } }))
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({
    stats: { successfulReferrals: 1, pendingReferrals: 2, maxReferrals: 5, discountPercent: 20 },
    referralUrl: 'https://useorbit.org/r/ORBIT1',
    isLoading: false, isError: false, error: null,
  }),
}))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = vi.fn(() => Promise.resolve())
    render() { return <>{this.props.children}{this.props.footer}</> }
  },
}))

interface HostNode {
  type: string
  props: Record<string, unknown>
  children: (HostNode | string)[] | null
}
interface RenderedNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (matches: (node: RenderedNode) => boolean) => RenderedNode[]
}
interface RenderedTree {
  root: RenderedNode
  toJSON: () => HostNode[]
  unmount: () => void
}
const TestRenderer = require('react-test-renderer') as {
  create: (element: React.ReactNode) => RenderedTree
  act: (action: () => void | Promise<void>) => Promise<void>
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const edges = [
  ['', Yoga.EDGE_ALL], ['Horizontal', Yoga.EDGE_HORIZONTAL], ['Vertical', Yoga.EDGE_VERTICAL],
  ['Left', Yoga.EDGE_LEFT], ['Right', Yoga.EDGE_RIGHT], ['Top', Yoga.EDGE_TOP], ['Bottom', Yoga.EDGE_BOTTOM],
] as const

function applyEdges(node: YogaNode, style: Record<string, unknown>) {
  for (const [suffix, edge] of edges) {
    const padding = style[`padding${suffix}`]
    const margin = style[`margin${suffix}`]
    if (typeof padding === 'number') node.setPadding(edge, padding)
    if (typeof margin === 'number') node.setMargin(edge, margin)
  }
}

function applyStyle(node: YogaNode, style: Record<string, unknown>) {
  applyEdges(node, style)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.justifyContent === 'flex-end') node.setJustifyContent(Yoga.JUSTIFY_FLEX_END)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (typeof style.flex === 'number') node.setFlex(style.flex)
  if (typeof style.width === 'number' || style.width === '100%') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
}

function buildLayout(element: HostNode, nodes: Map<HostNode, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(element, node)
  const style = StyleSheet.flatten((element.type === 'ScrollView' ? element.props.contentContainerStyle : element.props.style) as never) as Record<string, unknown> | undefined
  if (style) applyStyle(node, style)
  if (element.type === 'Text') {
    node.setMeasureFunc(() => ({ width: 64, height: 20 }))
  } else {
    (element.children ?? []).filter((child): child is HostNode => typeof child !== 'string')
      .forEach((child, index) => node.insertChild(buildLayout(child, nodes), index))
  }
  return node
}

function bounds(node: YogaNode) {
  let left = node.getComputedLeft()
  let ancestor = node.getParent()
  while (ancestor) { left += ancestor.getComputedLeft(); ancestor = ancestor.getParent() }
  return { left, right: left + node.getComputedWidth() }
}

function findHost(elements: HostNode[], matches: (element: HostNode) => boolean): HostNode {
  const queue = [...elements]
  while (queue.length > 0) {
    const element = queue.shift()!
    if (matches(element)) return element
    queue.push(...(element.children ?? []).filter((child): child is HostNode => typeof child !== 'string'))
  }
  throw new Error('Rendered surface missing')
}

describe('Referral drawer sheet geometry (mobile)', () => {
  afterEach(() => { __resetTestHostConfig() })

  it.each([320, 412, 640, 915])('aligns content and pinned Share at %ipx, including copy failure', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree: RenderedTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<ReferralDrawer open onClose={vi.fn()} />) })
    const copy = tree!.root.findAll((element) => element.type === 'Pressable' && element.props.accessibilityLabel === 'referral.drawer.copyLink')[0]!
    await TestRenderer.act(() => { (copy.props.onPress as () => void)() })
    const elements = tree!.toJSON()
    const nodes = new Map<HostNode, YogaNode>()
    const layout = Yoga.Node.create()
    elements.forEach((element, index) => layout.insertChild(buildLayout(element, nodes), index))
    try {
      const panelWidth = Math.min(width, 640)
      layout.calculateLayout(panelWidth, undefined)
      const link = findHost(elements, (element) => (element.children ?? []).some((child) => typeof child !== 'string' && child.props.accessibilityLabel === 'referral.drawer.copyLink'))
      const card = findHost(elements, (element) => (StyleSheet.flatten(element.props.style as never) as { borderRadius?: number } | undefined)?.borderRadius === 20)
      const disclaimer = findHost(elements, (element) => element.children?.includes('referral.drawer.disclaimer') === true)
      const error = findHost(elements, (element) => element.props.accessibilityRole === 'alert')
      const progress = findHost(elements, (element) => element.props.accessibilityRole === 'progressbar')
      for (const surface of [link, card, disclaimer, error, progress]) {
        expect(bounds(nodes.get(surface)!)).toEqual({ left: 24, right: panelWidth - 24 })
      }
      const share = findHost(elements, (element) => element.type === 'Pressable' && (element.children ?? []).some((child) => typeof child !== 'string' && child.children?.includes('referral.drawer.share')))
      expect(bounds(nodes.get(share)!).right).toBe(panelWidth - 24)
    } finally {
      layout.freeRecursive()
      await TestRenderer.act(() => { tree!.unmount() })
    }
  })
})

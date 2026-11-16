import React from 'react'
import { StyleSheet } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOUCH_TARGET_MIN, SPACING } from '@orbit/shared/theme'
import { InfoCard } from '@/components/ui/info-card'
import { createTokensV2 } from '@/lib/theme'
import { expectInsetHairlineRing } from '@/__tests__/support/inset-hairline-ring'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'
import { renderedText } from '../../support/react-test-renderer'
import { applyBorderWidths } from '@/__tests__/support/yoga-borders'

vi.unmock('@/components/ui/sheet')
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: () => { throw new Error('denied') } }))
const loadedReferral = {
  stats: { successfulReferrals: 1, pendingReferrals: 2, maxReferrals: 5, rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 20 },
  referralUrl: 'https://useorbit.org/r/ORBIT1',
  isLoading: false, isError: false, error: null,
}
const referralState = vi.hoisted(() => ({ loading: false }))
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => referralState.loading
    ? { stats: null, referralUrl: null, isLoading: true, isError: false, error: null }
    : loadedReferral,
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
  applyBorderWidths(node, style)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.justifyContent === 'flex-end') node.setJustifyContent(Yoga.JUSTIFY_FLEX_END)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (typeof style.flex === 'number') node.setFlex(style.flex)
  if (typeof style.width === 'number' || style.width === '100%') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
}

function buildLayout(element: HostNode, nodes: Map<HostNode, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(element, node)
  const hostStyle = element.type === 'ScrollView' ? element.props.contentContainerStyle : element.props.style
  const resolvedStyle = typeof hostStyle === 'function' ? hostStyle({ pressed: false }) : hostStyle
  const style = StyleSheet.flatten(resolvedStyle as never) as Record<string, unknown> | undefined
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

async function measureLinkBlock(loading: boolean) {
  referralState.loading = loading
  let tree: RenderedTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ReferralDrawer open onClose={vi.fn()} />) })
  const elements = tree!.toJSON()
  const nodes = new Map<HostNode, YogaNode>()
  const layout = Yoga.Node.create()
  elements.forEach((element, index) => layout.insertChild(buildLayout(element, nodes), index))
  try {
    layout.calculateLayout(412, undefined)
    const block = loading
      ? findHost(elements, (element) => element.props.testID === 'referral-skeleton').children![0] as HostNode
      : findHost(elements, (element) => (element.children ?? []).some((child) => typeof child !== 'string' && child.props.accessibilityLabel === 'referral.drawer.copyLink'))
    return nodes.get(block)!.getComputedHeight()
  } finally {
    layout.freeRecursive()
    await TestRenderer.act(() => { tree!.unmount() })
  }
}

describe('Referral drawer sheet geometry (mobile)', () => {
  afterEach(() => {
    __resetTestHostConfig()
    referralState.loading = false
  })

  it('holds the place of the loaded link well with a skeleton of the same height', async () => {
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
    const loadedHeight = await measureLinkBlock(false)
    expect(loadedHeight).toBe(TOUCH_TARGET_MIN + SPACING.s8)
    expect(await measureLinkBlock(true), 'the content does not move when the referral loads').toBe(loadedHeight)
  })

  it.each([320, 412, 640, 915])('aligns content and pinned Share at %ipx, including copy failure', async (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree: RenderedTree
    await TestRenderer.act(() => { tree = TestRenderer.create(<ReferralDrawer open onClose={vi.fn()} />) })
    const copy = tree!.root.findAll((element) => element.type === 'Pressable' && element.props.accessibilityLabel === 'referral.drawer.copyLink')[0]!
    await TestRenderer.act(() => { (copy.props.onPress as () => void)() })
    const cardView = tree!.root.findAll((element) => element.type === InfoCard)[0]!
      .findAll((element) => element.type === 'View')[0]!
    const elements = tree!.toJSON()
    const nodes = new Map<HostNode, YogaNode>()
    const layout = Yoga.Node.create()
    elements.forEach((element, index) => layout.insertChild(buildLayout(element, nodes), index))
    try {
      const panelWidth = Math.min(width, 640)
      layout.calculateLayout(panelWidth, undefined)
      const link = findHost(elements, (element) => (element.children ?? []).some((child) => typeof child !== 'string' && child.props.accessibilityLabel === 'referral.drawer.copyLink'))
      const card = findHost(elements, (element) => element.props.__nativeTag === cardView.props.__nativeTag)
      const disclaimer = findHost(elements, (element) => element.children?.includes('referral.reward.eligibility') === true)
      const error = findHost(elements, (element) => element.props.accessibilityRole === 'alert')
      const progress = findHost(elements, (element) => element.props.accessibilityRole === 'progressbar')
      for (const surface of [link, card, disclaimer, error, progress]) {
        expect(bounds(nodes.get(surface)!)).toEqual({ left: 24, right: panelWidth - 24 })
      }
      expectInsetHairlineRing(link.props.style as never, createTokensV2('orange', 'dark').hairline)
      expect((StyleSheet.flatten(link.props.style as never) as { borderRadius?: number }).borderRadius, 'the link well has the 12 dp field radius, as its web twin').toBe(12)
      expect(nodes.get(link)!.getComputedHeight(), 'the link well is as tall as its web twin and its loading skeleton').toBe(TOUCH_TARGET_MIN + SPACING.s8)
      const linkText = findHost([link], (element) => element.type === 'Text')
      expect(bounds(nodes.get(linkText)!).left, 'the link starts at the 16 dp well padding').toBe(24 + SPACING.s16)
      const share = findHost(elements, (element) => element.type === 'Pressable' && renderedText(element).trim() === 'referral.drawer.share')
      const button = nodes.get(share)!
      const parent = button.getParent()!
      const parentHost = findHost(elements, (element) => (element.children ?? []).includes(share))
      const parentSlop = parentHost.props.hitSlop as { left: number; right: number }
      const slop = (share.props.hitSlop as number | undefined) ?? 0
      expect(bounds(button).right).toBe(panelWidth - 24)
      expect(button.getComputedHeight()).toBe(44)
      expect(button.getComputedHeight() + slop * 2).toBeGreaterThanOrEqual(48)
      expect(button.getComputedWidth() + slop * 2).toBeGreaterThanOrEqual(48)
      expect(button.getComputedLeft() - slop).toBeGreaterThanOrEqual(-parentSlop.left)
      expect(button.getComputedLeft() + button.getComputedWidth() + slop).toBeLessThanOrEqual(parent.getComputedWidth() + parentSlop.right)
      expect(button.getComputedTop() - slop).toBeGreaterThanOrEqual(0)
      expect(button.getComputedTop() + button.getComputedHeight() + slop).toBeLessThanOrEqual(parent.getComputedHeight())
    } finally {
      layout.freeRecursive()
      await TestRenderer.act(() => { tree!.unmount() })
    }
  })
})

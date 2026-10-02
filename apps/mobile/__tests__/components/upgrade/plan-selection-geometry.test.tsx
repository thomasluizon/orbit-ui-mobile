import React from 'react'
import { act } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node } from 'yoga-layout'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { createTokensV2 } from '@/lib/theme'

interface HostJson {
  type: string
  props: {
    style?: StyleProp<ViewStyle & TextStyle>
    testID?: string
    importantForAccessibility?: string
    width?: number
    height?: number
    onLayout?: (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void
  }
  children: (HostJson | string)[] | null
}

interface RenderedTree {
  toJSON: () => HostJson
  unmount: () => void
}
const TestRenderer = require('react-test-renderer') as { create: (element: React.ReactElement) => RenderedTree }

vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({}) }
})

function textOf(element: HostJson): string {
  return (element.children ?? []).map((child) => typeof child === 'string' ? child : textOf(child)).join('')
}

function applyInsets(node: Node, style: ViewStyle) {
  for (const [key, edge] of [['padding', Yoga.EDGE_ALL], ['paddingHorizontal', Yoga.EDGE_HORIZONTAL], ['paddingVertical', Yoga.EDGE_VERTICAL], ['paddingTop', Yoga.EDGE_TOP]] as const) {
    if (typeof style[key] === 'number') node.setPadding(edge, style[key])
  }
  if (style.position === 'absolute') {
    node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
    for (const [key, edge] of [['top', Yoga.EDGE_TOP], ['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT]] as const) {
      if (typeof style[key] === 'number') node.setPosition(edge, style[key])
    }
  }
}

function applyStyle(node: Node, style: ViewStyle) {
  for (const [key, setter] of [
    ['height', 'setHeight'], ['width', 'setWidth'], ['minHeight', 'setMinHeight'],
    ['flexGrow', 'setFlexGrow'], ['flexShrink', 'setFlexShrink'], ['flex', 'setFlex'],
  ] as const) if (typeof style[key] === 'number') node[setter](style[key])
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (style.borderWidth) node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
  applyInsets(node, style)
}

function build(element: HostJson, boxes: Map<HostJson, Node>): Node {
  const node = Yoga.Node.create()
  boxes.set(element, node)
  const style = StyleSheet.flatten(element.props.style)
  applyStyle(node, style)
  if (element.type === 'Svg') { node.setWidth(element.props.width); node.setHeight(element.props.height) }
  if (element.type === 'Text') {
    /** Native font shaping is approximated; Yoga still consumes the rendered layout styles. */
    const fontSize = style.fontSize ?? 14
    const lineHeight = style.lineHeight ?? fontSize * 1.4
    node.setMeasureFunc((width) => {
      const textWidth = textOf(element).length * fontSize * 0.55
      return { width: Math.min(width, textWidth), height: Math.max(1, Math.ceil(textWidth / Math.max(1, width))) * lineHeight }
    })
  } else if (element.type === 'Pressable') {
    node.setHeight(44)
  } else {
    (element.children ?? []).filter((child): child is HostJson => typeof child !== 'string')
      .forEach((child, index) => node.insertChild(build(child, boxes), index))
  }
  return node
}

const cases = [412, 1440].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale })))

describe('Android Pro tier Yoga geometry', () => {
  it.each(cases)('hugs rendered content at $width in $locale', ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const t = (key: string, params?: Record<string, unknown>) => {
      const value = key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages)
      return String(value).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name]))
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    void act(() => { tree = TestRenderer.create(<PlanSelection plans={{ monthly: { unitAmount: 2990, currency: 'brl' }, yearly: { unitAmount: 19900, currency: 'brl' }, currency: 'brl', savingsPercent: 45, couponPercentOff: null }}
      isLoading={false} isError={false} isOnline monthlyOffer={null} yearlyOffer={null}
      selectedInterval="yearly" checkoutLoading={null} checkoutError="" checkoutDisabled={false}
      onSelectInterval={vi.fn()} onCheckout={vi.fn()} onRetry={vi.fn()} t={t} tokens={createTokensV2('orange', 'dark')} />) })
    const measure = () => {
      const boxes = new Map<HostJson, Node>()
      const root = build(tree.toJSON(), boxes)
      root.calculateLayout(Math.min(width, 740), undefined, Yoga.DIRECTION_LTR)
      return { root, boxes }
    }
    try {
      const initial = measure()
      void act(() => {
        for (const [element, box] of initial.boxes) {
          if (element.props.onLayout) element.props.onLayout({ nativeEvent: { layout: { x: box.getComputedLeft(), y: box.getComputedTop(), width: box.getComputedWidth(), height: box.getComputedHeight() } } })
        }
      })
      initial.root.freeRecursive()
      const measured = measure()
      try {
        const geometry = Array.from(measured.boxes)
        const measurements = ['yearly', 'monthly'].map((interval) => {
          const content = geometry.find(([element]) => element.props.testID === `upgrade-content-${interval}`)?.[1]
          const cardEntry = Array.from(measured.boxes).filter(([element]) => element.props.testID === `upgrade-tier-${interval}`).at(-1)!
          const [element, card] = cardEntry
          const action = card.getChild(card.getChildCount() - 1)
          const style = StyleSheet.flatten(element.props.style)
          const padding = Number(style.padding) + (style.borderWidth ?? 0)
          const belowButton = card.getComputedHeight() - action.getComputedTop() - action.getComputedHeight()
          const contentHeight = card.getComputedHeight() - belowButton + padding
          process.stdout.write(`${JSON.stringify({ width, locale, interval, cardHeight: card.getComputedHeight(), contentHeight, reservedHeight: content?.getComputedHeight(), belowButton, padding })}\n`)
          return { height: card.getComputedHeight(), contentHeight, reservedHeight: content?.getComputedHeight() }
        })
        for (const card of measurements) {
          expect(Math.abs(card.height - card.contentHeight)).toBeLessThanOrEqual(1)
          if (card.reservedHeight !== undefined) expect(Math.abs(card.reservedHeight - card.height)).toBeLessThanOrEqual(1)
        }
      } finally { measured.root.freeRecursive() }
    } finally { void act(() => tree.unmount()) }
  })
})

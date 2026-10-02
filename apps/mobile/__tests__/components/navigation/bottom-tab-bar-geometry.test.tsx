import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle, type TextStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
interface Host {
  type: string
  props: { style?: ViewStyle & TextStyle; testID?: string; children?: ReactNode; numberOfLines?: number }
  children: (Host | string)[] | null
}

function layoutHost(host: Host, nodes: Map<string, YogaNode>, fontScale: number): YogaNode {
  const node = Yoga.Node.create()
  const style = StyleSheet.flatten(host.props.style ?? {})
  for (const [key, setter] of [
    ['width', 'setWidth'], ['height', 'setHeight'], ['minWidth', 'setMinWidth'],
    ['minHeight', 'setMinHeight'], ['maxWidth', 'setMaxWidth'], ['flexGrow', 'setFlexGrow'],
    ['flexShrink', 'setFlexShrink'], ['flexBasis', 'setFlexBasis'],
  ] as const) {
    const value = style[key]
    if (typeof value === 'number') node[setter](value)
  }
  if (style.width === '100%') node.setWidthPercent(100)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (typeof style.borderTopWidth === 'number') node.setBorder(Yoga.EDGE_TOP, style.borderTopWidth)
  if (host.props.testID) nodes.set(host.props.testID, node)
  if (host.type === 'Text') {
    expect(host.props.numberOfLines).toBeUndefined()
    node.setMeasureFunc((width) => ({ width, height: (style.lineHeight ?? style.fontSize ?? 0) * fontScale }))
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

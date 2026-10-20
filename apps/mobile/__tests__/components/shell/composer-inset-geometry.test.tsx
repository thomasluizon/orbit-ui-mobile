import React from 'react'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { expect, it, vi } from 'vitest'
import { Composer } from '@/components/shell/composer'
import { AI_MESSAGE_COUNTER_THRESHOLD } from '@orbit/shared/chat'
import { SPACING } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

interface Host {
  type: string
  props: { style?: (ViewStyle & TextStyle) | ((state: { pressed: boolean }) => ViewStyle & TextStyle); testID?: string }
  children: (Host | string)[] | null
}

type Tree = ReturnType<typeof renderer.create> & { toJSON: () => Host; unmount: () => void }

function applyDimensions(node: YogaNode, style: ViewStyle) {
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applyDimensions(node, style)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.borderTopWidth === 'number') node.setBorder(Yoga.EDGE_TOP, style.borderTopWidth)
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'flex-end') node.setAlignItems(Yoga.ALIGN_FLEX_END)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  for (const [property, edge] of [['start', Yoga.EDGE_START], ['end', Yoga.EDGE_END], ['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT], ['top', Yoga.EDGE_TOP], ['bottom', Yoga.EDGE_BOTTOM]] as const) {
    const value = style[property]
    if (typeof value === 'number') node.setPosition(edge, value)
  }
}

function build(host: Host, nodes: Map<string, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  const declared = host.props.style
  const style = declared === undefined ? {} : StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared)
  applyStyle(node, style)
  if (host.props.testID) nodes.set(host.props.testID, node)
  if (host.type === 'TextInput') nodes.set('input', node)
  if (host.type === 'TextInput' || host.type === 'Text') {
    node.setMeasureFunc(() => ({ width: 80, height: 24 }))
  } else if (host.type !== 'Pressable') {
    const children = (host.children ?? []).filter((child): child is Host => typeof child !== 'string')
    children.forEach((child, index) => node.insertChild(build(child, nodes), index))
  }
  return node
}

function bounds(node: YogaNode) {
  let left = 0
  let ancestor: YogaNode | null = node
  while (ancestor) { left += ancestor.getComputedLeft(); ancestor = ancestor.getParent() }
  return { left, right: left + node.getComputedWidth() }
}

it.each([320, 412].flatMap(width => [false, true].flatMap(withGlyph =>
  ['ltr', 'rtl'].map(direction => ({ width, withGlyph, direction })),
)))('insets caret and placeholder together at $width with glyph $withGlyph in $direction', async ({ width, withGlyph, direction }) => {
  let tree!: Tree
  await renderer.act(() => {
    tree = renderer.create(<Composer state="idle" value="" suggestions={[]} words={en.shell.composer}
      onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
      attachWords={{ ...en.shell.composer.attach, remove: name => name }}
      {...withGlyph ? { onOpenConversation: vi.fn(), conversationLabel: en.todayAstra.openConversation } : {}} />) as Tree
  })
  const nodes = new Map<string, YogaNode>()
  const layout = build(tree.toJSON(), nodes)
  try {
    layout.calculateLayout(width, undefined, direction === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR)
    const pill = bounds(nodes.get('composer-field')!)
    const input = nodes.get('input')!
    const inputBox = bounds(input)
    const placeholder = bounds(nodes.get('composer-placeholder')!)
    const start = direction === 'rtl' ? pill.right - inputBox.right + input.getComputedPadding(Yoga.EDGE_RIGHT)
      : inputBox.left - pill.left + input.getComputedPadding(Yoga.EDGE_LEFT)
    const placeholderStart = direction === 'rtl' ? pill.right - placeholder.right : placeholder.left - pill.left
    expect.soft(start).toBe(4 + (withGlyph ? 48 : 0) + 8)
    expect.soft(placeholderStart).toBe(start)
    expect(input.getComputedPadding(Yoga.EDGE_LEFT)).toBe(8)
    expect(input.getComputedPadding(Yoga.EDGE_RIGHT)).toBe(8)
    expect(placeholder.right - placeholder.left).toBe(inputBox.right - inputBox.left - 16)
  } finally { layout.freeRecursive(); await renderer.act(() => tree.unmount()) }
})

it.each([320, 412])('keeps Hoje compact far from the daily limit at %s', async (width) => {
  const measured: number[] = []
  for (const used of [0, 3, 5]) {
    const nearLimit = 5 - used <= AI_MESSAGE_COUNTER_THRESHOLD
    let tree!: Tree
    await renderer.act(() => {
      tree = renderer.create(<Composer value="" suggestions={[]}
        words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()}
        usageMessage={nearLimit ? en.shell.composer.usage.replace('{used}', String(used)).replace('{limit}', '5') : undefined}
        renewalHint={nearLimit ? en.shell.composer.limit.renewal : undefined}
        {...used === 5 ? { state: 'atLimit', limitReason: en.shell.composer.limit.reason.replace('{allowance}', '5') } : { state: 'idle' }} />) as Tree
    })
    const nodes = new Map<string, YogaNode>()
    const layout = build(tree.toJSON(), nodes)
    try {
      layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
      measured.push(layout.getComputedHeight())
      const status = nodes.get('composer-status-slot')
      expect(Boolean(status)).toBe(nearLimit)
      expect(nodes.has('composer-usage')).toBe(nearLimit)
      if (!nearLimit) expect(nodes.get('composer-field')!.getComputedTop()).toBe(SPACING.s16 + StyleSheet.hairlineWidth)
    } finally { layout.freeRecursive(); await renderer.act(() => tree.unmount()) }
  }
  expect(measured[0]).toBeLessThan(measured[1]!)
  expect(measured[1]).toBe(measured[2])
})

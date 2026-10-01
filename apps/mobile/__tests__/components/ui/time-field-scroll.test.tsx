import React from 'react'
import { StyleSheet } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { __resetTestHostConfig, __setScrollToImpl, __setWindowDimensions } from '../../../test-mocks/react-native'
import { TimeField } from '@/components/ui/time-field'

vi.unmock('@/components/ui/sheet')
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }) }))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode; onDidDismiss: () => void }> {
    present = () => Promise.resolve()
    dismiss = () => { this.props.onDidDismiss(); return Promise.resolve() }
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
  },
}))

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Host {
  type: string
  props: Record<string, unknown>
  children: (Host | string)[] | null
}

function children(host: Host): Host[] {
  return (host.children ?? []).filter((child): child is Host => typeof child !== 'string')
}

function findHost(host: Host, matches: (host: Host) => boolean): Host | undefined {
  if (matches(host)) return host
  for (const child of children(host)) {
    const found = findHost(child, matches)
    if (found) return found
  }
}

function applyStyle(node: YogaNode, value: unknown) {
  const style = (StyleSheet.flatten((typeof value === 'function' ? value({ pressed: false }) : value) as never) as Record<string, unknown> | undefined) ?? {}
  for (const [key, setter] of [
    ['height', 'setHeight'], ['maxHeight', 'setMaxHeight'], ['minHeight', 'setMinHeight'],
    ['flex', 'setFlex'], ['flexGrow', 'setFlexGrow'], ['flexShrink', 'setFlexShrink'],
  ] as const) {
    const number = style[key]
    if (typeof number === 'number') node[setter](number)
  }
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  for (const [suffix, edge] of [
    ['Top', Yoga.EDGE_TOP], ['Bottom', Yoga.EDGE_BOTTOM],
    ['Vertical', Yoga.EDGE_VERTICAL], ['Horizontal', Yoga.EDGE_HORIZONTAL],
  ] as const) {
    const padding = style[`padding${suffix}`]
    if (typeof padding === 'number') node.setPadding(edge, padding)
  }
}

function layoutHost(host: Host, nodes: Map<Host, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(host, node)
  if (host.type === 'ScrollView') {
    node.setFlexGrow(1)
    node.setFlexShrink(1)
    node.setOverflow(Yoga.OVERFLOW_SCROLL)
  }
  applyStyle(node, host.props.style)
  if (host.type === 'Text') return node
  const content = host.type === 'ScrollView' ? Yoga.Node.create() : node
  if (content !== node) {
    applyStyle(content, host.props.contentContainerStyle)
    node.insertChild(content, 0)
  }
  children(host).forEach((child, index) => content.insertChild(layoutHost(child, nodes), index))
  return node
}

async function mountPicker(hourCycle: 'h12' | 'h23', value: Time24 = '23:59') {
  const onChange = vi.fn()
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<TimeField value={value} hourCycle={hourCycle} onChange={onChange} />)
    await Promise.resolve()
  })
  await TestRenderer.act(async () => {
    tree.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'common.selectTime: common.selectTime').props.onPress()
    await Promise.resolve()
  })
  TestRenderer.act(() => {
    const sheet = tree.root.findByType(TrueSheet)
    sheet.props.header.props.onLayout({ nativeEvent: { layout: { height: 68 } } })
    sheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: 96 } } })
  })
  return { tree, onChange }
}

afterEach(() => __resetTestHostConfig())

describe('TimeField scroll ownership in the native Sheet', () => {
  it.each([
    { width: 320, height: 320, hourCycle: 'h23' as const, value: '23:59' as const },
    { width: 320, height: 320, hourCycle: 'h12' as const, value: '23:59' as const },
    { width: 915, height: 412, hourCycle: 'h12' as const, value: '00:00' as const },
    { width: 412, height: 915, hourCycle: 'h23' as const, value: '07:15' as const },
  ])('contains every column and opens selected values at $width x $height ($hourCycle)', async ({ width, height, hourCycle, value }) => {
    __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const { tree } = await mountPicker(hourCycle, value)
    const bodyHost = findHost(tree.toJSON(), (host) => host.props.testID === 'sheet-body-scroll')!
    const nodes = new Map<Host, YogaNode>()
    const body = layoutHost(bodyHost, nodes)
    try {
      body.calculateLayout(Math.min(width, 640), undefined)
      const bodyContent = body.getChild(0)
      expect(bodyContent.getComputedHeight()).toBeLessThanOrEqual(body.getComputedHeight() + 0.5)
      const groups = children(children(bodyHost)[0]!)
      expect(groups).toHaveLength(hourCycle === 'h23' ? 2 : 3)
      expect(groups.map((group) => children(findHost(group, (host) => host.type === 'ScrollView')!).length)).toEqual(hourCycle === 'h23' ? [24, 60] : [12, 60, 2])
      for (const group of groups) {
        const scrollHost = findHost(group, (host) => host.type === 'ScrollView')!
        const scrollNode = nodes.get(scrollHost)!
        const viewportHeight = scrollNode.getComputedHeight()
        expect(viewportHeight).toBeGreaterThanOrEqual(44)
        expect(viewportHeight).toBeLessThanOrEqual(220)
        const renderedGroup = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'View' && node.props.accessibilityLabel === group.props.accessibilityLabel)[0]
        const scroll = renderedGroup.findByType('ScrollView')
        scrollTo.mockClear()
        TestRenderer.act(() => scroll.props.onLayout({ nativeEvent: { layout: { height: viewportHeight } } }))
        const offset = scrollTo.mock.calls.at(-1)![0].y as number
        const content = scrollNode.getChild(0)
        const selected = children(scrollHost).find((host) => (host.props.accessibilityState as { checked?: boolean } | undefined)?.checked)!
        const selectedNode = nodes.get(selected)!
        expect(selectedNode.getComputedTop() - offset).toBeGreaterThanOrEqual(-0.5)
        expect(selectedNode.getComputedTop() - offset + selectedNode.getComputedHeight()).toBeLessThanOrEqual(viewportHeight + 0.5)
        for (const option of children(scrollHost)) {
          const row = nodes.get(option)!
          const reachableOffset = Math.max(0, Math.min(row.getComputedTop(), content.getComputedHeight() - viewportHeight))
          expect(row.getComputedTop() - reachableOffset).toBeGreaterThanOrEqual(-0.5)
          expect(row.getComputedTop() - reachableOffset + row.getComputedHeight()).toBeLessThanOrEqual(viewportHeight + 0.5)
        }
        expect(scrollHost.props.nestedScrollEnabled).toBe(false)
      }
      const sheet = tree.root.findByType(TrueSheet)
      expect(sheet.props.footer).toBeDefined()
      expect(findHost(bodyHost, (host) => host.props.children === 'common.done')).toBeUndefined()
    } finally {
      body.freeRecursive()
      TestRenderer.act(() => tree.unmount())
    }
  })

  it.each(['h12', 'h23'] as const)('discards the %s draft on cancellation and reopens the persisted value', async (hourCycle) => {
    const { tree, onChange } = await mountPicker(hourCycle)
    await TestRenderer.act(async () => {
      tree.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === '01').props.onPress()
      tree.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'common.close').props.onPress()
      await Promise.resolve()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(tree.root.findByType('TextInput').props.value).toBe(hourCycle === 'h23' ? '23:59' : '11:59 pm')
    await TestRenderer.act(async () => {
      tree.root.findAllByType('Pressable').find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'common.selectTime: common.selectTime').props.onPress()
      await Promise.resolve()
    })
    const selectedLabels = tree.root.findAll((node: { type: unknown; props: { accessibilityState?: { checked?: boolean }; accessibilityLabel?: string } }) => node.type === 'Pressable' && node.props.accessibilityState?.checked).map((node: { props: { accessibilityLabel: string } }) => node.props.accessibilityLabel)
    expect(selectedLabels).toEqual(hourCycle === 'h23' ? ['23', '59'] : ['11', '59', 'PM'])
    TestRenderer.act(() => tree.unmount())
  })
})

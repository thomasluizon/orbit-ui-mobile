import React from 'react'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

interface Host {
  type: string
  props: { style?: ViewStyle | TextStyle; accessibilityRole?: string; numberOfLines?: number }
  children: (Host | string)[] | null
}

function textWidth(label: string, size: number) {
  const font = require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Geist" font-size="${size}">${label}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
  return Math.ceil(bounds.x + bounds.width)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignSelf === 'flex-start') node.setAlignSelf(Yoga.ALIGN_FLEX_START)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (typeof style.flexBasis === 'number') node.setFlexBasis(style.flexBasis)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (style.maxWidth === '100%') node.setMaxWidthPercent(100)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.borderWidth === 'number') node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
}

function buildLayout(host: Host, fontScale: number, labels: { node: YogaNode; intrinsic: number; host: Host }[], radios: YogaNode[]): YogaNode {
  const node = Yoga.Node.create()
  const style = StyleSheet.flatten(host.props.style ?? {}) as ViewStyle & TextStyle
  applyStyle(node, style)
  if (host.props.accessibilityRole === 'radio') radios.push(node)
  if (host.type === 'Text') {
    const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
    const intrinsic = textWidth(label, style.fontSize! * fontScale)
    labels.push({ node, intrinsic, host })
    node.setMeasureFunc((width, mode) => ({ width: mode === Yoga.MEASURE_MODE_UNDEFINED ? intrinsic : Math.min(width, intrinsic), height: (style.lineHeight ?? 20) * fontScale }))
  } else {
    (host.children ?? []).filter((child): child is Host => typeof child !== 'string').forEach((child, index) => node.insertChild(buildLayout(child, fontScale, labels, radios), index))
  }
  return node
}

afterEach(__resetTestHostConfig)

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }].flatMap((locale) => [1, 2].map((fontScale) => ({ ...locale, fontScale }))))('contains compact schedule labels in $locale at 320 and scale $fontScale', async ({ messages, fontScale }) => {
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
  const words = messages.onboarding.flow.when
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<SegmentedControl label={words.scheduleMode} value="fixed" onChange={vi.fn()}
    options={[{ value: 'fixed', label: words.fixedMode }, { value: 'flexible', label: words.flexibleMode }, { value: 'interval', label: words.intervalMode }, { value: 'oneTime', label: words.oneTimeMode }]} />) as typeof tree })
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const radios: YogaNode[] = []
  const layout = buildLayout(tree.toJSON(), fontScale, labels, radios)
  try {
    layout.calculateLayout(288, undefined, Yoga.DIRECTION_LTR)
    for (const label of labels) {
      expect(label.node.getComputedWidth()).toBeGreaterThanOrEqual(label.intrinsic)
      if (fontScale > 1.3) expect(label.host.props.numberOfLines).toBeUndefined()
    }
    expect(layout.getComputedWidth()).toBeLessThanOrEqual(288)
    expect(new Set(radios.map((node) => node.getComputedWidth())).size).toBe(1)
    for (const radio of radios) expect(radio.getComputedHeight()).toBeGreaterThanOrEqual(44)
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

import React from 'react'
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarStats } from '@/app/(tabs)/calendar/_components/calendar-stats'
import { StatTile } from '@/components/ui/stat-tile'
import { __resetTestHostConfig, __setWindowDimensions } from '../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')
interface Host {
  type: string
  props: { style?: ViewStyle | TextStyle; accessibilityRole?: string; numberOfLines?: number }
  children: (Host | string)[] | null
}

function textWidth(label: string, style: TextStyle, scale: number) {
  const display = style.fontFamily === 'SpaceGrotesk_600SemiBold'
  const mono = style.fontFamily === 'GeistMono_500Medium'
  const family = display ? 'Space Grotesk' : mono ? 'Geist Mono' : 'Geist'
  const font = display ? require.resolve('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf')
    : mono ? require.resolve('@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf')
    : require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="60" font-family="${family}" font-size="${Number(style.fontSize) * scale}">${label}</text></svg>`
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
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (style.flex === 1) node.setFlex(1)
  if (typeof style.fontSize === 'number' && host.type !== 'Text') node.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN)
  if (host.type === 'Text') {
    const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
    const intrinsic = textWidth(label, style, fontScale)
    labels.push({ node, intrinsic, host })
    node.setMeasureFunc((width, mode) => ({ width: mode === Yoga.MEASURE_MODE_UNDEFINED ? intrinsic : Math.min(width, intrinsic), height: Math.ceil(intrinsic / Math.max(width, 1)) * (style.lineHeight ?? 20) * fontScale }))
  } else {
    (host.children ?? []).filter((child): child is Host => typeof child !== 'string').forEach((child, index) => node.insertChild(buildLayout(child, fontScale, labels, radios), index))
  }
  return node
}

afterEach(__resetTestHostConfig)

it.each([en, ptBR].flatMap((catalog) => [320, 360, 384, 412].flatMap((width) => [1, 2].map((fontScale) => ({ catalog, width, fontScale })))))('keeps figures readable at $width and text scale $fontScale', async ({ catalog, width, fontScale }) => {
  __setWindowDimensions({ width, height: 900, scale: 1, fontScale })
  const stats = [
    { key: 'bestStreak', value: 123, label: catalog.calendar.bestStreak },
    { key: 'totalLogs', value: 999, label: catalog.calendar.totalLogs },
    { key: 'missed', value: 31, label: catalog.calendar.missedCount },
  ] as const
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<View>
    <CalendarStats stats={stats} />
    <CalendarStats stats={stats} state="empty" emptyLabel={catalog.calendar.emptyStat} />
    <View style={{ padding: 16, gap: 12 }}>
      <StatTile value="100%" label={catalog.progressScreen.window.completionRate} />
      {Object.values(catalog.dates.daysAbbreviated).map((day) => <StatTile key={day} value={day} label={catalog.progressScreen.window.bestWeekday} />)}
      <StatTile state="empty" emptyLabel={catalog.progressScreen.window.bestWeekdayEmpty} label={catalog.progressScreen.window.bestWeekday} />
    </View>
  </View>) as typeof tree })
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const layout = buildLayout(tree.toJSON(), fontScale, labels, [])
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    expect(labels.length).toBeGreaterThan(20)
    for (const label of labels) {
      expect(label.node.getComputedWidth(), label.host.children?.filter((child): child is string => typeof child === 'string').join('')).toBeGreaterThanOrEqual(label.intrinsic)
      expect(label.host.props.numberOfLines).toBeUndefined()
      expect(label.node.getComputedHeight()).toBeGreaterThanOrEqual(20 * fontScale)
    }
    expect(layout.getComputedWidth()).toBe(width)
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

import React from 'react'
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarStats } from '@/app/(tabs)/calendar/_components/calendar-stats'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { StatTile } from '@/components/ui/stat-tile'
import { __resetTestHostConfig, __setWindowDimensions } from '../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')
interface Host {
  type: string
  props: { style?: ViewStyle | TextStyle; accessibilityRole?: string; numberOfLines?: number; testID?: string }
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

function applyAlignment(node: YogaNode, style: ViewStyle) {
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  applyAlignment(node, style)
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

function buildLayout(host: Host, fontScale: number, labels: { node: YogaNode; intrinsic: number; host: Host }[], figures: { node: YogaNode; state: string }[], parentFigure = false, config?: ReturnType<typeof Yoga.Config.create>): YogaNode {
  const node = Yoga.Node.create(config)
  if (host.props.testID?.startsWith('calendar-figure-')) figures.push({ node, state: host.props.testID })
  const figure = parentFigure || !!host.props.testID?.match(/^(stat-tile|calendar-figure)-/)
  const flattened = StyleSheet.flatten(host.props.style ?? {}) as (ViewStyle & TextStyle) | undefined
  const style = flattened ?? {}
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  applyStyle(node, style)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (style.flex === 1) node.setFlex(1)
  if (typeof style.fontSize === 'number' && host.type !== 'Text') node.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN)
  if (host.type === 'Text') {
    const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
    const intrinsic = textWidth(label, style, fontScale)
    if (figure || label === en.progressScreen.streak.next || label === ptBR.progressScreen.streak.next) labels.push({ node, intrinsic, host })
    node.setMeasureFunc((width, mode) => ({ width: mode === Yoga.MEASURE_MODE_UNDEFINED ? intrinsic : Math.min(width, intrinsic), height: Math.ceil(intrinsic / Math.max(width, 1)) * (style.lineHeight ?? 20) * fontScale }))
  } else {
    (host.children ?? []).filter((child): child is Host => typeof child !== 'string').forEach((child, index) => node.insertChild(buildLayout(child, fontScale, labels, figures, figure, config), index))
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
    <CalendarStats stats={stats} state="loading" loadingLabel={catalog.calendar.loading} />
    <CalendarStats stats={stats} state="empty" emptyLabel={catalog.calendar.emptyStat} />
    <View style={{ padding: 16, gap: 12 }}>
      <FreezeBank banked={2} ceiling={3} usedThisMonth={1} daysTowardNext={4} earnRateDays={7}
        longestValue={123} longestLabel={catalog.progressScreen.streak.longest} tierValue={catalog.streakDisplay.detail.tierLegendary}
        tierLabel={catalog.streakDisplay.detail.tierTileLabel} protectedDays={[]} words={{
          active: catalog.progressScreen.streak.active, frozen: catalog.progressScreen.streak.frozen, missed: catalog.progressScreen.streak.missed, today: catalog.progressScreen.streak.today,
          legendLabel: catalog.progressScreen.streak.legend, bankedLabel: catalog.progressScreen.streak.banked, usedLabel: catalog.progressScreen.streak.used,
          nextLabel: catalog.progressScreen.streak.next, nextProgressLabel: catalog.progressScreen.streak.nextProgress, nextFreezeProgress: catalog.progressScreen.streak.nextOf.replace('{current}', '4').replace('{total}', '7'),
          protectedLabel: catalog.progressScreen.streak.protectedDays, protectedEmpty: catalog.progressScreen.streak.protectedEmpty,
          protectedDay: catalog.progressScreen.streak.protected, protectedToday: catalog.progressScreen.streak.protectedToday,
        }} />
      <StatTile value="100%" label={catalog.progressScreen.window.completionRate} />
      {Object.values(catalog.dates.daysAbbreviated).map((day) => <StatTile key={day} value={day} label={catalog.progressScreen.window.bestWeekday} />)}
      <StatTile state="empty" emptyLabel={catalog.progressScreen.window.bestWeekdayEmpty} label={catalog.progressScreen.window.bestWeekday} />
    </View>
  </View>) as typeof tree })
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const figures: { node: YogaNode; state: string }[] = []
  const layout = buildLayout(tree.toJSON(), fontScale, labels, figures)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    const loadedHeights = figures.filter((figure) => figure.state === 'calendar-figure-default').map((figure) => figure.node.getComputedHeight())
    figures.filter((figure) => figure.state === 'calendar-figure-loading').forEach((figure, index) => expect(Math.abs(figure.node.getComputedHeight() - loadedHeights[index]!)).toBeLessThanOrEqual(1))
    expect(labels.length).toBeGreaterThan(20)
    for (const label of labels) {
      const text = label.host.children?.filter((child): child is string => typeof child === 'string').join('')
      const nextCaption = text === catalog.progressScreen.streak.next
      if (!nextCaption || fontScale <= 1.3) expect(label.node.getComputedWidth(), text).toBeGreaterThanOrEqual(label.intrinsic)
      if (nextCaption) {
        expect(label.node.getComputedWidth()).toBeLessThanOrEqual(width - 66)
        expect(label.node.getComputedHeight()).toBeGreaterThanOrEqual(Math.ceil(label.intrinsic / label.node.getComputedWidth()) * 20 * fontScale)
      }
      expect(label.host.props.numberOfLines).toBeUndefined()
      expect(label.node.getComputedHeight()).toBeGreaterThanOrEqual(20 * fontScale)
    }
    expect(layout.getComputedWidth()).toBe(width)
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})


it.each([en, ptBR].flatMap((catalog) => [280, 311, 312, 320, 360, 384, 412].flatMap((width) => [1, 1.3, 1.31, 2].map((fontScale) => ({ catalog, width, fontScale })))))('aligns calendar figures at $width and text scale $fontScale', async ({ catalog, width, fontScale }) => {
  __setWindowDimensions({ width, height: 900, scale: 1, fontScale })
  const stats = [
    { key: 'bestStreak', value: 123, label: catalog.calendar.bestStreak },
    { key: 'totalLogs', value: 999, label: catalog.calendar.totalLogs },
    { key: 'missed', value: 31, label: catalog.calendar.missedCount },
  ] as const
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<View>
    <CalendarStats stats={stats} />
    <CalendarStats stats={stats} state="loading" loadingLabel={catalog.calendar.loading} />
    <CalendarStats stats={stats} state="empty" emptyLabel={catalog.calendar.emptyStat} />
  </View>) as typeof tree })
  const figures: { node: YogaNode; state: string }[] = []
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const config = Yoga.Config.create()
  config.setPointScaleFactor(0)
  const layout = buildLayout(tree.toJSON(), fontScale, labels, figures, false, config)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    expect(figures).toHaveLength(9)
    for (const { node } of figures) {
      const value = node.getChild(0)
      const caption = node.getChild(1)
      expect(value.getComputedLeft()).toBe(0)
      expect(caption.getComputedLeft()).toBe(0)
      expect(caption.getComputedTop() - value.getComputedTop() - value.getComputedHeight()).toBeCloseTo(8, 0)
      expect(Math.abs(node.getComputedHeight() - (30.8 * fontScale + 8 + 20 * fontScale))).toBeLessThanOrEqual(1)
      expect(caption.getComputedHeight()).toBeCloseTo(20 * fontScale, 0)
    }
    for (let offset = 0; offset < figures.length; offset += 3) {
      const group = figures.slice(offset, offset + 3)
      expect(group[0]!.node.getComputedLeft()).toBe(16)
      for (let index = 1; index < group.length; index++) {
        const previous = group[index - 1]!.node
        const current = group[index]!.node
        expect(Math.abs(current.getComputedWidth() - previous.getComputedWidth())).toBeLessThanOrEqual(1)
        if (width - 32 < 20 * 14 * fontScale || fontScale > 1.3) {
          expect(current.getComputedLeft()).toBe(16)
          expect(current.getComputedTop() - previous.getComputedTop() - previous.getComputedHeight()).toBeCloseTo(16, 0)
        } else {
          expect(current.getComputedLeft() - previous.getComputedLeft() - previous.getComputedWidth()).toBeCloseTo(16, 0)
          expect(current.getComputedTop()).toBe(previous.getComputedTop())
        }
      }
    }
    for (const label of labels) expect(label.node.getComputedWidth()).toBeGreaterThanOrEqual(label.intrinsic)
  } finally { layout.freeRecursive(); config.free(); await TestRenderer.act(() => tree.unmount()) }
})

it('reflows within a narrower parent and returns to columns when it grows', async () => {
  __setWindowDimensions({ width: 600, height: 900, scale: 1, fontScale: 1 })
  const stats = [
    { key: 'bestStreak', value: 123, label: ptBR.calendar.bestStreak },
    { key: 'totalLogs', value: 999, label: ptBR.calendar.totalLogs },
    { key: 'missed', value: 31, label: ptBR.calendar.missedCount },
  ] as const
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<CalendarStats stats={stats} />) as typeof tree })
  try {
    for (const width of [280, 320, 412]) {
      const row = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-stats')[0]!
      const onLayout = row.props.onLayout
      if (typeof onLayout !== 'function') throw new TypeError('Calendar figures must respond to their measured group width')
      await TestRenderer.act(() => onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } } }))
      const figures: { node: YogaNode; state: string }[] = []
      const layout = buildLayout(tree.toJSON(), 1, [], figures)
      try {
        layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
        expect(figures).toHaveLength(3)
        const first = figures[0]!.node
        const second = figures[1]!.node
        expect(first.getComputedLeft()).toBe(16)
        if (width === 280) {
          expect(second.getComputedLeft()).toBe(16)
          expect(second.getComputedTop()).toBeGreaterThan(first.getComputedTop())
        } else {
          expect(second.getComputedTop()).toBe(first.getComputedTop())
          expect(second.getComputedLeft() - first.getComputedLeft() - first.getComputedWidth()).toBe(16)
        }
      } finally { layout.freeRecursive() }
    }
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

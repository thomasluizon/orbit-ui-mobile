import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native'
import type { ReactTestRenderer, ReactTestRendererJSON } from 'react-test-renderer'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { STAT_TILE_MIN_HEIGHT, StatTile } from '@/components/ui/stat-tile'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const TestRenderer = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
type LayoutStyle = ViewStyle & TextStyle
type RenderedTree = ReactTestRenderer & { toJSON(): ReactTestRendererJSON; unmount(): void }

function numericDimension(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function applyLayoutStyle(node: YogaNode, style: LayoutStyle) {
  node.setFlex(style.flex)
  node.setMinWidth(numericDimension(style.minWidth))
  node.setMinHeight(numericDimension(style.minHeight))
  node.setWidth(style.width as number | `${number}%` | undefined)
  node.setMaxWidth(style.maxWidth as number | `${number}%` | undefined)
  node.setHeight(style.height as number | `${number}%` | undefined)
  node.setGap(Yoga.GUTTER_ALL, numericDimension(style.gap))
  node.setPadding(Yoga.EDGE_ALL, numericDimension(style.padding))
  node.setPadding(Yoga.EDGE_HORIZONTAL, numericDimension(style.paddingHorizontal))
  node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
}

function buildLayout(host: ReactTestRendererJSON, fontScale: number, config: ReturnType<typeof Yoga.Config.create>): YogaNode {
  const node = Yoga.Node.create(config)
  const style = StyleSheet.flatten(host.props.style) as LayoutStyle | undefined
  if (style) applyLayoutStyle(node, style)
  if (host.type === 'Text') {
    node.setMeasureFunc(() => ({ width: (style?.fontSize ?? 14) * fontScale, height: (style?.lineHeight ?? 20) * fontScale }))
  } else {
    for (const child of Array.isArray(host.children) ? host.children : []) {
      if (typeof child !== 'string') node.insertChild(buildLayout(child, fontScale, config), node.getChildCount())
    }
  }
  return node
}

describe('StatTile loading layout (mobile)', () => {
  it.each([320, 360, 412].flatMap((width) => [1, 2].map((fontScale) => ({ width, fontScale }))))('contains each placeholder in its tile content at $width and font scale $fontScale', ({ width, fontScale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    for (const catalog of [en, ptBR]) {
      let tree!: RenderedTree
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
            {[1, 2, 3].map((key) => <StatTile key={key} state="loading" loadingLabel={catalog.calendar.loading} label={catalog.calendar.bestStreak} />)}
          </View>,
        )
      })
      const host = tree.toJSON()
      const config = Yoga.Config.create()
      config.setPointScaleFactor(0)
      const layout = buildLayout(host, fontScale, config)
      try {
        layout.calculateLayout(width, undefined)
        expect(layout.getComputedWidth()).toBe(width)
        const tiles = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'stat-tile-loading')
        expect(tiles).toHaveLength(3)
        for (let index = 0; index < layout.getChildCount(); index++) {
          const tile = layout.getChild(index)
          const value = tile.getChild(0)
          const placeholder = value.getChild(1)
          const contentLeft = tile.getComputedPadding(Yoga.EDGE_LEFT) + tile.getComputedBorder(Yoga.EDGE_LEFT)
          const contentRight = tile.getComputedWidth() - tile.getComputedPadding(Yoga.EDGE_RIGHT) - tile.getComputedBorder(Yoga.EDGE_RIGHT)
          const placeholderLeft = value.getComputedLeft() + placeholder.getComputedLeft()
          expect(placeholderLeft).toBeGreaterThanOrEqual(contentLeft - 0.5)
          expect(placeholderLeft + placeholder.getComputedWidth()).toBeLessThanOrEqual(contentRight + 0.5)
          expect(placeholder.getComputedWidth()).toBeGreaterThan(0)
          expect(placeholder.getComputedWidth()).toBeLessThanOrEqual(64)
          expect(tile.getComputedHeight()).toBeGreaterThanOrEqual(STAT_TILE_MIN_HEIGHT)
          expect(tile.getChild(1).getComputedTop() - value.getComputedTop() - value.getComputedHeight()).toBeCloseTo(8, 0)
          expect(value.getComputedHeight()).toBeCloseTo(22 * 1.4 * fontScale, 0)
          expect(tiles[index]!.props.accessibilityRole).toBe('progressbar')
          expect(tiles[index]!.props.accessibilityLabel).toBe(catalog.calendar.loading)
          expect(tiles[index]!.findAll((child) => typeof child.type === 'string' && child.props.accessibilityElementsHidden === true && child.props.importantForAccessibility === 'no-hide-descendants')).toHaveLength(1)
        }
      } finally {
        layout.freeRecursive()
        config.free()
        TestRenderer.act(() => tree.unmount())
      }
    }
  })
})

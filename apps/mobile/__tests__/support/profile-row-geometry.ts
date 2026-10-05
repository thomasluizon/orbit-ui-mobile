import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'

interface HostRow {
  type: string
  props: { style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle); numberOfLines?: number; accessibilityLabel?: string }
  children: (HostRow | string)[] | null
}

const widths = new Map<string, number>()

function textWidth(label: string, style: TextStyle, scale: number): number {
  const size = Number(style.fontSize) * scale
  const cacheKey = `${style.fontFamily}:${size}:${label}`
  const cached = widths.get(cacheKey)
  if (cached !== undefined) return cached
  const mono = style.fontFamily?.startsWith('GeistMono_')
  const family = mono ? 'Geist Mono' : 'Geist'
  const file = mono ? require.resolve('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf') : require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')
  const escaped = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="100"><text y="60" font-family="${family}" font-size="${size}" letter-spacing="${Number(style.letterSpacing ?? 0) * scale}">${escaped}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [file], loadSystemFonts: false } }).getBBox()
  const width = bounds ? Math.ceil(bounds.x + bounds.width) : 0
  widths.set(cacheKey, width)
  return width
}

function wrappedLines(label: string, available: number, style: TextStyle, scale: number): number {
  if (textWidth(label, style, scale) <= available) return 1
  let lines = 1
  let current = ''
  for (const token of label.split(/(?<=\s)/)) {
    if (textWidth(current + token, style, scale) <= available) { current += token; continue }
    if (current) { lines++; current = '' }
    for (const character of token) {
      if (current && textWidth(current + character, style, scale) > available) { lines++; current = '' }
      current += character
    }
  }
  return lines
}

function applyFlexStyle(node: YogaNode, style: ViewStyle) {
  if (style.flex === 1) node.setFlex(1)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (typeof style.flexBasis === 'number') node.setFlexBasis(style.flexBasis)
  if (style.flexBasis === 'auto') node.setFlexBasisAuto()
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applyFlexStyle(node, style)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (style.maxWidth === '100%') node.setMaxWidthPercent(100)
  if (style.maxWidth === '50%') node.setMaxWidthPercent(50)
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (style.width === '100%') node.setWidthPercent(100)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  for (const [property, edge] of [
    ['paddingHorizontal', Yoga.EDGE_HORIZONTAL],
    ['paddingVertical', Yoga.EDGE_VERTICAL],
    ['paddingTop', Yoga.EDGE_TOP],
    ['paddingBottom', Yoga.EDGE_BOTTOM],
    ['paddingEnd', Yoga.EDGE_END],
  ] as const) {
    const padding = style[property]
    if (typeof padding === 'number') node.setPadding(edge, padding)
  }
}

function position(node: YogaNode): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  let left = 0
  let top = 0
  let current: YogaNode | null = node
  while (current) { left += current.getComputedLeft(); top += current.getComputedTop(); current = current.getParent() }
  return { left, top, right: left + node.getComputedWidth(), bottom: top + node.getComputedHeight(), width: node.getComputedWidth(), height: node.getComputedHeight() }
}

export function measureProfileRow(host: HostRow, width: number, scale: number) {
  const texts: { node: YogaNode; label: string; style: TextStyle; limit: number | undefined }[] = []
  const controls: { node: YogaNode; labels: string[]; accessibilityLabel?: string }[] = []
  function labelsOf(host: HostRow): string[] {
    return (host.children ?? []).flatMap((child) => typeof child === 'string' ? [child] : labelsOf(child))
  }
  function layoutHost(host: HostRow): YogaNode {
    const node = Yoga.Node.create()
    const declared = host.props.style
    const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {}) as TextStyle & ViewStyle
    applyStyle(node, style)
    if (host.type === 'Pressable') controls.push({ node, labels: labelsOf(host), accessibilityLabel: host.props.accessibilityLabel })
    const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
    if (host.type === 'Text' && label) {
      texts.push({ node, label, style, limit: host.props.numberOfLines })
      node.setMeasureFunc((available, mode) => {
        const natural = textWidth(label, style, scale)
        const measured = mode === Yoga.MEASURE_MODE_UNDEFINED ? natural : Math.min(natural, available)
        const lines = wrappedLines(label, measured, style, scale)
        return { width: measured, height: Math.min(lines, host.props.numberOfLines ?? lines) * Number(style.lineHeight ?? Number(style.fontSize) * 1.4) * scale }
      })
    } else {
      (host.children ?? []).filter((child): child is HostRow => typeof child !== 'string').forEach((child, index) => node.insertChild(layoutHost(child), index))
    }
    return node
  }
  const layout = layoutHost(host)
  try {
    layout.calculateLayout(width, 'auto', Yoga.DIRECTION_LTR)
    return { height: layout.getComputedHeight(), controls: controls.map(({ node, labels, accessibilityLabel }) => {
      const bounds = position(node)
      const content = Array.from({ length: node.getChildCount() }, (_, index) => position(node.getChild(index)))
      return { labels, accessibilityLabel, ...bounds, inlineClearance: Math.min(Math.min(...content.map((child) => child.left)) - bounds.left, bounds.right - Math.max(...content.map((child) => child.right))) }
    }), texts: texts.map(({ node, label, style, limit }) => {
      const lines = wrappedLines(label, node.getComputedWidth(), style, scale)
      return { label, ...position(node), lines: Math.min(lines, limit ?? lines), clipped: limit !== undefined && lines > limit, lineHeightRatio: Number(style.lineHeight ?? Number(style.fontSize) * 1.4) / Number(style.fontSize) }
    }) }
  } finally { layout.freeRecursive() }
}

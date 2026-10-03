import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'

export interface GeometryHost {
  type: string
  props: {
    style?: (ViewStyle & TextStyle) | ((state: { pressed: boolean }) => ViewStyle & TextStyle)
    contentContainerStyle?: ViewStyle
    testID?: string
    accessibilityRole?: string
    accessibilityLabel?: string
  }
  children: (GeometryHost | string)[] | null
}

export type GeometryTree = ReturnType<typeof import('react-test-renderer').create> & {
  toJSON: () => GeometryHost
  unmount: () => void
}

function applyFlexStyle(node: YogaNode, style: ViewStyle) {
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignSelf === 'center') node.setAlignSelf(Yoga.ALIGN_CENTER)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.justifyContent === 'space-between') node.setJustifyContent(Yoga.JUSTIFY_SPACE_BETWEEN)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applyFlexStyle(node, style)
  if (typeof style.width === 'number' || style.width === '100%') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  if (style.display === 'none') node.setDisplay(Yoga.DISPLAY_NONE)
  for (const [property, edge] of [['top', Yoga.EDGE_TOP], ['bottom', Yoga.EDGE_BOTTOM], ['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT]] as const) {
    if (typeof style[property] === 'number') node.setPosition(edge, style[property])
  }
  for (const [property, edge] of [['padding', Yoga.EDGE_ALL], ['paddingHorizontal', Yoga.EDGE_HORIZONTAL], ['paddingVertical', Yoga.EDGE_VERTICAL], ['paddingTop', Yoga.EDGE_TOP], ['paddingBottom', Yoga.EDGE_BOTTOM], ['paddingLeft', Yoga.EDGE_LEFT], ['paddingRight', Yoga.EDGE_RIGHT]] as const) {
    if (typeof style[property] === 'number') node.setPadding(edge, style[property])
  }
}

function bounds(node: YogaNode) {
  let top = 0
  let ancestor: YogaNode | null = node
  while (ancestor) { top += ancestor.getComputedTop(); ancestor = ancestor.getParent() }
  return { top, bottom: top + node.getComputedHeight(), contentTop: top + node.getComputedPadding(Yoga.EDGE_TOP) }
}

export function measureSafeArea(host: GeometryHost, select: (host: GeometryHost) => string | undefined) {
  const selected = new Map<string, YogaNode>()
  function build(host: GeometryHost): YogaNode {
    const node = Yoga.Node.create()
    const declared = host.props.style
    const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {})
    applyStyle(node, style)
    const key = select(host)
    if (key) selected.set(key, node)
    if (host.type === 'Text') {
      node.setMeasureFunc(() => ({ width: 100, height: style.lineHeight ?? style.fontSize ?? 20 }))
      return node
    }
    let owner = node
    if (host.props.contentContainerStyle) {
      owner = Yoga.Node.create()
      applyStyle(owner, StyleSheet.flatten(host.props.contentContainerStyle))
      node.insertChild(owner, 0)
    }
    ;(host.children ?? []).filter((child): child is GeometryHost => typeof child !== 'string').forEach((child, index) => owner.insertChild(build(child), index))
    return node
  }
  const layout = build(host)
  try {
    layout.calculateLayout(412, 915, Yoga.DIRECTION_LTR)
    return new Map([...selected].map(([key, node]) => [key, bounds(node)]))
  } finally { layout.freeRecursive() }
}

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'

export interface GeometryHost {
  props: { testID?: string; style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>) }
  children: (GeometryHost | string)[] | null
}

function applyGridDimensions(node: YogaNode, style: ViewStyle) {
  if (typeof style.width === 'number' || style.width === '100%') node.setWidth(style.width)
  if (typeof style.maxWidth === 'number' || style.maxWidth === '100%') node.setMaxWidth(style.maxWidth)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (style.aspectRatio !== undefined) node.setAspectRatio(Number(style.aspectRatio))
}

function applyGridStyle(node: YogaNode, style: ViewStyle) {
  applyGridDimensions(node, style)
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignSelf === 'center') node.setAlignSelf(Yoga.ALIGN_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.rowGap === 'number') node.setGap(Yoga.GUTTER_ROW, style.rowGap)
  if (typeof style.columnGap === 'number') node.setGap(Yoga.GUTTER_COLUMN, style.columnGap)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  applyGridPosition(node, style)
}

function applyGridPosition(node: YogaNode, style: ViewStyle) {
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  for (const [property, edge] of [['top', Yoga.EDGE_TOP], ['bottom', Yoga.EDGE_BOTTOM], ['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT]] as const) {
    const offset = style[property] ?? style.inset
    if (typeof offset === 'number') node.setPosition(edge, offset)
  }
}

export function measureGrid(host: GeometryHost | GeometryHost[], width: number, view: 'month' | 'range', isLoading: boolean) {
  const config = Yoga.Config.create()
  config.setPointScaleFactor(0)
  const discs: { node: YogaNode; column: YogaNode }[] = []
  const selected = new Map<string, YogaNode>()
  const targets: YogaNode[] = []
  const placeholders: { node: YogaNode; column: YogaNode; ancestors: YogaNode[] }[] = []
  function build(current: GeometryHost, column?: YogaNode, ancestors: YogaNode[] = []): YogaNode {
    const node = Yoga.Node.create(config)
    const declared = current.props.style
    const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {})
    applyGridStyle(node, style)
    const currentColumn = style.flex === 1 ? node : column
    const currentAncestors = style.flex === 1 ? [] : [...ancestors, node]
    if (current.props.testID === 'day-disc') discs.push({ node, column: currentColumn! })
    if (current.props.testID === 'skeleton-grid-shape') placeholders.push({ node, column: currentColumn!, ancestors: currentAncestors })
    if (current.props.testID) {
      selected.set(current.props.testID, node)
      const prefix = view === 'month' ? 'calendar-day-select-' : 'day-cell-'
      if (current.props.testID.startsWith(prefix)) targets.push(node)
    }
    for (const child of current.children ?? []) {
      if (typeof child !== 'string') node.insertChild(build(child, currentColumn, currentAncestors), node.getChildCount())
    }
    return node
  }
  const root = build(Array.isArray(host) ? { props: {}, children: host } : host)
  try {
    root.calculateLayout(width, 'auto', Yoga.DIRECTION_LTR)
    const card = view === 'range' ? selected.get('month-grid-7-columns')!.getParent()!
      : selected.get('calendar-grid')!.getChild(0)
    const frame = view === 'range' ? card : selected.get('calendar-grid')!
    const grid = selected.get('month-grid-7-columns') ?? card
    const row = isLoading && view === 'month' ? card.getChild(0).getChild(0) : selected.get('month-grid-row-0')!
    const slots = Array.from({ length: row.getChildCount() }, (_, index) => row.getChild(index))
    const selector = selected.get('segmented-control-enabled')
    const bounds = (node: YogaNode) => {
      let left = 0
      let ancestor: YogaNode | null = node
      while (ancestor) { left += ancestor.getComputedLeft(); ancestor = ancestor.getParent() }
      return { left, right: left + node.getComputedWidth() }
    }
    return {
      gridEdges: bounds(grid),
      columnGap: slots[1]!.getComputedLeft() - slots[0]!.getComputedLeft() - slots[0]!.getComputedWidth(),
      slots: slots.map((node) => ({ width: node.getComputedWidth(), height: node.getComputedHeight() })),
      switchEdges: selector ? bounds(selector) : undefined,
      discs: discs.map(({ node, column }) => ({ width: node.getComputedWidth(), height: node.getComputedHeight(), columnWidth: column.getComputedWidth() })),
      cardWidth: grid.getComputedWidth(),
      contentWidth: width - 32,
      inlineInset: frame.getComputedPadding(Yoga.EDGE_LEFT),
      frameWidth: frame.getComputedWidth(),
      loadingRowWidth: isLoading && view === 'month' ? card.getChild(0).getChild(0).getComputedWidth() : undefined,
      placeholders: placeholders.map(({ node, column, ancestors }) => ({
        center: ancestors.reduce((offset, ancestor) => offset + ancestor.getComputedLeft(), 0) + node.getComputedWidth() / 2,
        columnCenter: column.getComputedWidth() / 2,
        width: node.getComputedWidth(),
        columnWidth: column.getComputedWidth(),
      })),
      targets: targets.map((node) => ({ width: node.getComputedWidth(), height: node.getComputedHeight(), columnWidth: node.getParent()!.getComputedWidth() })),
    }
  } finally { root.freeRecursive(); config.free() }
}

export function measureDaySurface(host: GeometryHost | GeometryHost[], width: number) {
  const config = Yoga.Config.create()
  config.setPointScaleFactor(0)
  const records: { node: YogaNode; column?: YogaNode; testID?: string; style: ViewStyle; day: boolean }[] = []
  function build(current: GeometryHost, column?: YogaNode, day = false): YogaNode {
    const node = Yoga.Node.create(config)
    const declared = current.props.style
    const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {})
    applyGridStyle(node, style)
    const currentColumn = style.flex === 1 ? node : column
    const currentDay = day || Boolean(current.props.testID?.startsWith('calendar-day-slot-') || current.props.testID?.startsWith('day-cell-'))
    records.push({ node, column: currentColumn, testID: current.props.testID, style, day: currentDay })
    for (const child of current.children ?? []) {
      if (typeof child !== 'string') node.insertChild(build(child, currentColumn, currentDay), node.getChildCount())
    }
    return node
  }
  const root = build(Array.isArray(host) ? { props: {}, children: host } : host)
  const bounds = (node: YogaNode) => {
    let left = 0
    let top = 0
    let ancestor: YogaNode | null = node
    while (ancestor) { left += ancestor.getComputedLeft(); top += ancestor.getComputedTop(); ancestor = ancestor.getParent() }
    const width = node.getComputedWidth()
    const height = node.getComputedHeight()
    return { left, top, width, height, centerX: left + width / 2, centerY: top + height / 2 }
  }
  try {
    root.calculateLayout(width, 'auto', Yoga.DIRECTION_LTR)
    return records.map(({ node, column, testID, style, day }) => ({
      testID, style, day, ...bounds(node), column: bounds(column ?? root),
    }))
  } finally { root.freeRecursive(); config.free() }
}

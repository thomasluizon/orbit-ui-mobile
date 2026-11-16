import type { ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'

const BORDER_EDGES = [
  ['borderWidth', Yoga.EDGE_ALL], ['borderTopWidth', Yoga.EDGE_TOP], ['borderBottomWidth', Yoga.EDGE_BOTTOM],
  ['borderLeftWidth', Yoga.EDGE_LEFT], ['borderRightWidth', Yoga.EDGE_RIGHT],
  ['borderStartWidth', Yoga.EDGE_START], ['borderEndWidth', Yoga.EDGE_END],
] as const

/** Gives each `border*Width` its space inside the Yoga box, as React Native does on the device. */
export function applyBorderWidths(node: YogaNode, style: Readonly<Record<string, unknown>> | ViewStyle) {
  for (const [property, edge] of BORDER_EDGES) {
    const width = (style as Record<string, unknown>)[property]
    if (typeof width === 'number') node.setBorder(edge, width)
  }
}

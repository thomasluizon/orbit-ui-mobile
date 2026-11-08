import { measureInteractionFills } from './interaction-fill-geometry'

type Host = Parameters<typeof measureInteractionFills>[0]
type Part = ReturnType<typeof measureInteractionFills>[number]

function bounds({ left, right, top, bottom, width }: Part) {
  return { left, right, top, bottom, width }
}

function sizedGlyphs(host: Host): Host {
  const size = (host.props as { size?: unknown }).size
  if (typeof size === 'number' && !host.children?.length) return { ...host, type: 'Svg', props: { ...host.props, width: size, height: size } as Host['props'] }
  return { ...host, children: host.children?.map((child) => typeof child === 'string' ? child : sizedGlyphs(child)) ?? null }
}

export function measureStartEdgeIconAction(tree: { toJSON: () => Host }, width: number, label: string) {
  const parts = measureInteractionFills(sizedGlyphs(tree.toJSON()), width, false)
  const button = parts.find((part) => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === label)!
  const column = parts.find((part) => part.slot === button.ancestors.at(-1))!
  const glyph = parts.find((part) => part.host.type === 'Svg' && part.ancestors.includes(button.slot))!
  const hitSlop = button.host.props.hitSlop
  return {
    root: bounds(parts[0]!),
    column: bounds(column),
    paint: bounds(button),
    glyph: bounds(glyph),
    texts: parts.filter((part) => part.host.type === 'Text' && part.ancestors.at(-1) === column.slot).map(bounds),
    targetWidth: button.width + 2 * (typeof hitSlop === 'number' ? hitSlop : 0),
  }
}

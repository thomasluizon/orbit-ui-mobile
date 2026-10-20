export function readExpandedControlGeometry(element: Element) {
  const bounds = element.getBoundingClientRect()
  const style = getComputedStyle(element, '::before')
  let { left, right, top, bottom } = bounds
  for (const pseudo of ['::before', '::after']) {
    const reach = getComputedStyle(element, pseudo)
    if (['none', 'normal'].includes(reach.content) || reach.position !== 'absolute' || reach.pointerEvents === 'none') continue
    left = Math.min(left, bounds.left + Number.parseFloat(reach.left))
    right = Math.max(right, bounds.right - Number.parseFloat(reach.right))
    top = Math.min(top, bounds.top + Number.parseFloat(reach.top))
    bottom = Math.max(bottom, bounds.bottom - Number.parseFloat(reach.bottom))
  }
  const points = [
    [left + 1, (top + bottom) / 2],
    [right - 1, (top + bottom) / 2],
    [(left + right) / 2, top + 1],
    [(left + right) / 2, bottom - 1],
  ]
  return {
    left, right, top, bottom, width: right - left, height: bottom - top,
    edgeHits: points.map(([x, y]) => element.isSameNode(document.elementFromPoint(x!, y!)?.closest('button') ?? null)),
    outlineOffset: Number.parseFloat(style.outlineOffset),
    outlineWidth: Number.parseFloat(style.outlineWidth),
  }
}

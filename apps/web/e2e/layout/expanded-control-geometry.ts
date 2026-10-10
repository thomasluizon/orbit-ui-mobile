export function readExpandedControlGeometry(element: Element) {
  const bounds = element.getBoundingClientRect()
  const style = getComputedStyle(element, '::before')
  const left = bounds.left + Number.parseFloat(style.left)
  const right = bounds.right - Number.parseFloat(style.right)
  const top = bounds.top + Number.parseFloat(style.top)
  const bottom = bounds.bottom - Number.parseFloat(style.bottom)
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

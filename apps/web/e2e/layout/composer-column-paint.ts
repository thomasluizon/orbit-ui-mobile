export function measureChromePaint(element: HTMLElement) {
  const clip = element.closest<HTMLElement>('[data-shell-notice], [data-shell-pinned-slot], [data-shell-fab-clip]')
  if (!clip) throw new Error('Bottom chrome clip missing')
  const bounds = element.getBoundingClientRect()
  const clipBounds = clip.getBoundingClientRect()
  const style = getComputedStyle(element)
  const extent = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const shadow of style.boxShadow.replace(/rgba?\([^)]*\)/g, '').split(',')) {
    if (shadow.includes('inset') || shadow.trim() === 'none') continue
    const [offsetX, offsetY, blur = 0, spread = 0] = shadow.match(/-?[\d.]+px/g)?.map(parseFloat) ?? []
    if (offsetX === undefined || offsetY === undefined) throw new Error('Unresolved chrome shadow')
    extent.top = Math.max(extent.top, blur + spread - offsetY)
    extent.right = Math.max(extent.right, blur + spread + offsetX)
    extent.bottom = Math.max(extent.bottom, blur + spread + offsetY)
    extent.left = Math.max(extent.left, blur + spread - offsetX)
  }
  const outline = style.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset))
  for (const side of ['top', 'right', 'bottom', 'left'] as const) extent[side] = Math.max(extent[side], outline)
  const clipLeft = clipBounds.left + clip.clientLeft
  const clipTop = clipBounds.top + clip.clientTop
  return {
    extent,
    clearance: {
      top: bounds.top - clipTop,
      right: clipLeft + clip.clientWidth - bounds.right,
      bottom: clipTop + clip.clientHeight - bounds.bottom,
      left: bounds.left - clipLeft,
    },
    shadow: style.boxShadow,
    outlineWidth: parseFloat(style.outlineWidth),
    clipPointerEvents: getComputedStyle(clip).pointerEvents,
    hit: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
  }
}

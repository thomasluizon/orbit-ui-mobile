export function readControlHitArea(element: Element) {
  const bounds = element.getBoundingClientRect()
  const hit = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
  const pixels = (value: string) => Number.parseFloat(value) || 0
  for (const pseudo of ['::before', '::after']) {
    const style = getComputedStyle(element, pseudo)
    if (style.content === 'none' || style.content === 'normal' || style.pointerEvents === 'none' || style.position !== 'absolute') continue
    const elementStyle = getComputedStyle(element)
    const width = pixels(style.width) + (style.boxSizing === 'border-box' ? 0 : pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth))
    const height = pixels(style.height) + (style.boxSizing === 'border-box' ? 0 : pixels(style.paddingTop) + pixels(style.paddingBottom) + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth))
    const left = bounds.left + pixels(elementStyle.borderLeftWidth) + (style.left === 'auto' ? bounds.width - pixels(style.right) - width : pixels(style.left))
    const top = bounds.top + pixels(elementStyle.borderTopWidth) + (style.top === 'auto' ? bounds.height - pixels(style.bottom) - height : pixels(style.top))
    hit.left = Math.min(hit.left, left)
    hit.top = Math.min(hit.top, top)
    hit.right = Math.max(hit.right, left + width)
    hit.bottom = Math.max(hit.bottom, top + height)
  }
  const check = element.matches('.orbit-pill-action[data-size="sm"]')
    ? { left: bounds.left - 2, right: bounds.right + 2, top: bounds.top - 2, bottom: bounds.bottom + 2 }
    : hit
  const checks = [
    [check.left, bounds.top + bounds.height / 2],
    [check.right - 0.01, bounds.top + bounds.height / 2],
    [bounds.left + bounds.width / 2, check.top],
    [bounds.left + bounds.width / 2, check.bottom - 0.01],
  ].map(([x, y]) => element.contains(document.elementFromPoint(x!, y!)))
  return { ...hit, width: hit.right - hit.left, height: hit.bottom - hit.top, checks }
}

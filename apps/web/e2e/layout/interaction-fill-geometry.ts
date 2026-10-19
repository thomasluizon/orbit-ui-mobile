export function inspectInteractionFill(element: Element, clearance: number) {
  const pixels = (value: string) => Number.parseFloat(value) || 0
  const transparent = (value: string) => value === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value) || /\/\s*0(?:\.0+)?\)$/.test(value)
  const painted = (style: CSSStyleDeclaration) => !transparent(style.backgroundColor) || style.backgroundImage !== 'none'
    || style.outlineStyle !== 'none' && pixels(style.outlineWidth) > 0 && !transparent(style.outlineColor)
    || ['Top', 'Right', 'Bottom', 'Left'].some((side) => pixels(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && !transparent(style.getPropertyValue(`border-${side.toLowerCase()}-color`)))
    || style.boxShadow.split(/,(?![^()]*\))/).some((shadow) => shadow !== 'none' && !transparent(shadow.match(/rgba?\([^)]*\)/)?.[0] ?? 'black'))
  const visible = (node: Element) => {
    if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    const box = node.getBoundingClientRect()
    if (box.width <= 1 || box.height <= 1 || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight) return false
    const style = getComputedStyle(node)
    return style.clipPath !== 'inset(50%)' && !(style.position === 'absolute' && style.clip !== 'auto')
  }
  const name = (node: Element) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}[${node.getAttribute('aria-label') ?? node.getAttribute('data-testid') ?? node.textContent.trim().replace(/\s+/g, ' ').slice(0, 100)}]`
  const expand = (box: DOMRect, style: CSSStyleDeclaration) => {
    const outline = style.outlineStyle === 'none' ? 0 : Math.max(0, pixels(style.outlineWidth) + pixels(style.outlineOffset))
    const extent = { left: box.left - outline, right: box.right + outline, top: box.top - outline, bottom: box.bottom + outline }
    for (const shadow of style.boxShadow.split(/,(?![^()]*\))/)) {
      if (shadow === 'none' || shadow.includes('inset')) continue
      const lengths = shadow.replace(/(?:rgba?|hsla?|color|oklch|oklab)\([^)]*\)/g, '').trim().split(/\s+/).map(pixels)
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths
      const radius = spread + blur * 1.5
      extent.left = Math.min(extent.left, box.left + x - radius); extent.right = Math.max(extent.right, box.right + x + radius)
      extent.top = Math.min(extent.top, box.top + y - radius); extent.bottom = Math.max(extent.bottom, box.bottom + y + radius)
    }
    return extent
  }
  function pseudoBox(owner: Element, pseudo: '::before' | '::after') {
    const style = getComputedStyle(owner, pseudo)
    if (['none', 'normal'].includes(style.content) || style.display === 'none' || pixels(style.opacity) === 0 || !painted(style)) return null
    const surrogate = document.createElement('span')
    for (const property of style) surrogate.style.setProperty(property, style.getPropertyValue(property))
    surrogate.style.setProperty('transition', 'none', 'important')
    surrogate.style.setProperty('animation', 'none', 'important')
    surrogate.style.setProperty('pointer-events', 'none', 'important')
    surrogate.setAttribute('aria-hidden', 'true')
    if (!['absolute', 'fixed'].includes(style.position)) throw new Error(`Unmeasured flow pseudo-element on ${name(owner)}${pseudo}`)
    owner.append(surrogate)
    try { return expand(surrogate.getBoundingClientRect(), style) } finally { surrogate.remove() }
  }
  const bounds = element.getBoundingClientRect()
  const fill = { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
  let hasFill = false
  const interactive = 'button, a[href], input, textarea, select, summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [tabindex]'
  for (const owner of [element, ...element.querySelectorAll('*')]) {
    if (!visible(owner)) continue
    if (owner !== element && owner.matches(interactive)) continue
    const style = getComputedStyle(owner)
    const boxes = [visible(owner) && painted(style) ? expand(owner.getBoundingClientRect(), style) : null,
      pseudoBox(owner, '::before'), pseudoBox(owner, '::after')].filter((box) => box !== null)
    for (const box of boxes) {
      hasFill = true
      fill.left = Math.min(fill.left, box.left); fill.right = Math.max(fill.right, box.right)
      fill.top = Math.min(fill.top, box.top); fill.bottom = Math.max(fill.bottom, box.bottom)
    }
  }
  const contentOwner = element.parentElement?.matches('[data-personal-text-action]') ? element.parentElement : element
  const neighbours = [...document.body.querySelectorAll('*')].filter((node) => {
    if (node === element || contentOwner.contains(node) || node.contains(element) || !visible(node) || node.parentElement?.closest('svg')) return false
    return node.matches('img, svg, canvas, video') || [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())
      || painted(getComputedStyle(node))
  })
  const violations = hasFill ? neighbours.flatMap((neighbour) => {
    const box = neighbour.getBoundingClientRect()
    const horizontal = Math.max(0, box.left - fill.right, fill.left - box.right)
    const vertical = Math.max(0, box.top - fill.bottom, fill.top - box.bottom)
    const distance = Math.hypot(horizontal, vertical)
    return distance + 0.1 < clearance ? [{ neighbour: name(neighbour), distance }] : []
  }) : []
  const column = element.closest('[data-shell-column]')?.getBoundingClientRect()
  if (hasFill && column && (fill.left < column.left + clearance - 0.1 || fill.right > column.right - clearance + 0.1)) {
    violations.push({ neighbour: 'page column edge', distance: Math.min(fill.left - column.left, column.right - fill.right) })
  }
  return { control: name(element), fill, hasFill, violations }
}

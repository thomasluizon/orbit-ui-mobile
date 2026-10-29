export function inspectInteractionSurface(control: Element, clearance: number) {
  function paintOwner(control: Element) {
    return control.matches('[data-composer-input-row] textarea[data-composer-input]') ? control.closest('[data-composer-input-row]')! : control
  }
  const element = paintOwner(control)
  const pixels = (value: string) => Number.parseFloat(value) || 0
  const transparent = (value: string) => value === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value) || /\/\s*0(?:\.0+)?\)$/.test(value)
  const painted = (style: CSSStyleDeclaration) => !transparent(style.backgroundColor) || style.backgroundImage !== 'none'
    || style.outlineStyle !== 'none' && pixels(style.outlineWidth) > 0 && !transparent(style.outlineColor)
    || ['Top', 'Right', 'Bottom', 'Left'].some((side) => pixels(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && !transparent(style.getPropertyValue(`border-${side.toLowerCase()}-color`)))
    || style.boxShadow.split(/,(?![^()]*\))/).some((shadow) => shadow !== 'none' && !transparent(shadow.match(/(?:rgba?|hsla?|color|oklch|oklab)\([^)]*\)/)?.[0] ?? 'black'))
  const visible = (node: Element) => {
    if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    const box = node.getBoundingClientRect()
    if (box.width <= 1 || box.height <= 1 || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight) return false
    for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      if (style.clipPath === 'inset(50%)' || style.position === 'absolute' && style.clip === 'rect(0px, 0px, 0px, 0px)') return false
    }
    return true
  }
  const clipTextRect = (rect: DOMRect, parent: Element) => {
    let { left, right, top, bottom } = rect
    for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      const clipsInline = style.overflowX !== 'visible' || style.textOverflow === 'ellipsis'
      const clipsBlock = style.overflowY !== 'visible'
      if (!clipsInline && !clipsBlock) continue
      const clip = ancestor.getBoundingClientRect()
      if (clipsInline) { left = Math.max(left, clip.left); right = Math.min(right, clip.right) }
      if (clipsBlock) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom) }
    }
    return right > left && bottom > top ? { left, right, top, bottom } : null
  }
  const name = (node: Element) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}[${node.getAttribute('aria-label') ?? node.getAttribute('data-testid') ?? node.textContent.trim().replace(/\s+/g, ' ').slice(0, 100)}]`
  const layer = (node: Element): Element | Document => {
    const overlay = node.closest('[role="dialog"], [role="menu"]')
    if (overlay) return overlay
    for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).position === 'fixed') return ancestor
    }
    return document
  }
  const controlLayer = layer(element)
  const shellRegion = element.closest('[data-shell-scroller], [data-shell-bottom]')
  const expand = (box: DOMRect, style: CSSStyleDeclaration) => {
    const outline = style.outlineStyle === 'none' ? 0 : Math.max(0, pixels(style.outlineWidth) + pixels(style.outlineOffset))
    const extent = { left: box.left - outline, right: box.right + outline, top: box.top - outline, bottom: box.bottom + outline }
    for (const shadow of style.boxShadow.split(/,(?![^()]*\))/)) {
      if (shadow === 'none' || shadow.includes('inset') || transparent(shadow.match(/(?:rgba?|hsla?|color|oklch|oklab)\([^)]*\)/)?.[0] ?? 'black')) continue
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
  const cell = element.closest('[data-interaction-fill-grid] > *') ?? (element.hasAttribute('data-interaction-fill-cell') ? element : null)
  const bounds = (cell ?? element).getBoundingClientRect()
  const fill = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
  const interactive = 'button, a[href], input, textarea, select, summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [tabindex]'
  function measureFill() {
    let hasFill = false
  for (const owner of [element, ...element.querySelectorAll('*')]) {
    if (!visible(owner) || layer(owner) !== controlLayer) continue
    if (owner.closest('[data-notification-count]')) continue
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
    return hasFill
  }
  const hasFill = measureFill()
  const contentOwner = element.parentElement?.matches('[data-personal-text-action]') ? element.parentElement : element
  const insideCell = (box: typeof fill) => box.left >= bounds.left - 0.1 && box.right <= bounds.right + 0.1
    && box.top >= bounds.top - 0.1 && box.bottom <= bounds.bottom + 0.1
  const containedCell = Boolean(cell) && insideCell(fill)
  function boundaryViolations() {
    const violations: { neighbour: string; distance: number }[] = []
    if (!hasFill) return violations
    if (cell && !containedCell) {
      violations.push({ neighbour: 'grid cell edge', distance: Math.min(fill.left - bounds.left, bounds.right - fill.right, fill.top - bounds.top, bounds.bottom - fill.bottom) })
    }
    const columnOwner = element.closest('[data-shell-column]')
    const column = columnOwner && layer(columnOwner) === controlLayer ? columnOwner.getBoundingClientRect() : null
    if (column && (fill.left < column.left + clearance - 0.1 || fill.right > column.right - clearance + 0.1)) {
      violations.push({ neighbour: 'page column edge', distance: Math.min(fill.left - column.left, column.right - fill.right) })
    }
    return violations
  }
  const neighbours = [...document.body.querySelectorAll('*')].filter((node) =>
    node !== element && !contentOwner.contains(node) && !node.contains(element) && layer(node) === controlLayer
    && (!shellRegion || !node.closest('[data-shell-scroller], [data-shell-bottom]') || node.closest('[data-shell-scroller], [data-shell-bottom]') === shellRegion)
    && !(element.matches('input.orbit-field-hover, textarea.orbit-field-hover') && node.matches('svg[aria-hidden="true"]:not([tabindex]):not([role])')
      && node.parentElement === element.parentElement && getComputedStyle(node).pointerEvents === 'none')
    && visible(node) && !node.matches('svg[data-interaction-fill-graphics]')
    && (!node.parentElement?.closest('svg') || node.matches('svg[data-interaction-fill-graphics] > path')))
  const violations = hasFill ? neighbours.flatMap((neighbour) => {
    const style = getComputedStyle(neighbour)
    const boxes = [painted(style) || neighbour.matches('img, svg, canvas, video, svg[data-interaction-fill-graphics] > path') ? expand(neighbour.getBoundingClientRect(), style) : null,
      pseudoBox(neighbour, '::before'), pseudoBox(neighbour, '::after')].filter((box) => box !== null)
    for (const child of neighbour.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNode(child)
      for (const rect of range.getClientRects()) {
        const clipped = clipTextRect(rect, neighbour)
        if (clipped) boxes.push(clipped)
      }
    }
    return boxes.flatMap((box) => {
      const horizontal = Math.max(0, box.left - fill.right, fill.left - box.right)
      const vertical = Math.max(0, box.top - fill.bottom, fill.top - box.bottom)
      const ownGraphic = neighbour.matches('svg[data-interaction-fill-graphics] > path') && insideCell(box)
      const distance = ownGraphic
        ? Math.min(box.top - fill.top, fill.bottom - box.bottom)
        : Math.hypot(horizontal, vertical)
      return distance + 0.1 < clearance ? [{ neighbour: name(neighbour), distance }] : []
    })
  }) : []
  function glyphCentering() {
  const glyphs = [...element.querySelectorAll('svg')].filter(visible)
  const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let hasVisibleText = false
  while (text.nextNode()) {
    const parent = text.currentNode.parentElement!
    if (text.currentNode.textContent?.trim() && !parent.closest('svg, [aria-hidden="true"]') && visible(parent)) hasVisibleText = true
  }
  return !hasVisibleText && glyphs.length === 1 && hasFill ? (() => {
    const glyph = glyphs[0]!.getBoundingClientRect()
    return { inline: Math.abs((glyph.left + glyph.right - fill.left - fill.right) / 2), block: Math.abs((glyph.top + glyph.bottom - fill.top - fill.bottom) / 2) }
  })() : null
  }
  const centering = glyphCentering()
  return { control: name(control), fill, hasFill, centering, violations: [...violations, ...boundaryViolations()] }
}

import { expect, type Locator, type Page } from '@playwright/test'

export async function readOutlineVisibility(target: Locator) {
  return target.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const style = getComputedStyle(element)
    const width = Number.parseFloat(style.outlineWidth)
    const offset = Number.parseFloat(style.outlineOffset)
    const extent = width + offset
    const bounds = element.getBoundingClientRect()
    const radius = Math.max(0, Math.min(Number.parseFloat(style.borderTopLeftRadius), bounds.width / 2, bounds.height / 2) + extent)
    const outer = { left: bounds.left - extent, right: bounds.right + extent, top: bounds.top - extent, bottom: bounds.bottom + extent }
    const points = [
      { x: outer.left + radius, y: outer.top }, { x: outer.right - radius, y: outer.top },
      { x: outer.left + radius, y: outer.bottom }, { x: outer.right - radius, y: outer.bottom },
      { x: outer.left, y: outer.top + radius }, { x: outer.right, y: outer.top + radius },
      { x: outer.left, y: outer.bottom - radius }, { x: outer.right, y: outer.bottom - radius },
    ]
    for (const [centerX, centerY, start] of [
      [outer.left + radius, outer.top + radius, Math.PI],
      [outer.right - radius, outer.top + radius, Math.PI * 1.5],
      [outer.right - radius, outer.bottom - radius, 0],
      [outer.left + radius, outer.bottom - radius, Math.PI / 2],
    ] as const) {
      for (let step = 0; step <= 8; step += 1) {
        const angle = start + step * Math.PI / 16
        points.push({ x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) })
      }
    }
    const clippedBy: string[] = []
    if (points.some(({ x, y }) => x < -0.5 || y < -0.5 || x > innerWidth + 0.5 || y > innerHeight + 0.5)) clippedBy.push('viewport')
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const ancestorStyle = getComputedStyle(ancestor)
      const clipsX = ancestorStyle.overflowX !== 'visible'
      const clipsY = ancestorStyle.overflowY !== 'visible'
      if (!clipsX && !clipsY) continue
      const clipBounds = ancestor.getBoundingClientRect()
      const left = clipBounds.left + ancestor.clientLeft
      const top = clipBounds.top + ancestor.clientTop
      const right = left + ancestor.clientWidth
      const bottom = top + ancestor.clientHeight
      const clipRadius = Math.min(Number.parseFloat(ancestorStyle.borderTopLeftRadius), ancestor.clientWidth / 2, ancestor.clientHeight / 2)
      const clipped = points.some(({ x, y }) => {
        if (clipsX && (x < left - 0.5 || x > right + 0.5)) return true
        if (clipsY && (y < top - 0.5 || y > bottom + 0.5)) return true
        if (!clipsX || !clipsY || clipRadius === 0) return false
        const centerX = Math.max(left + clipRadius, Math.min(x, right - clipRadius))
        const centerY = Math.max(top + clipRadius, Math.min(y, bottom - clipRadius))
        return Math.hypot(x - centerX, y - centerY) > clipRadius + 0.5
      })
      if (clipped) clippedBy.push(ancestor.getAttribute('aria-label') ?? (ancestor.className || ancestor.tagName))
    }
    return { width, offset, visible: style.outlineStyle !== 'none' && width >= 2, clippedBy }
  })
}

export interface FieldIndicatorOptions {
  includeDescendants?: boolean
  forcedColors?: boolean
}

export async function readFieldIndicators(
  target: Locator,
  rootSelector: string,
  options: FieldIndicatorOptions = {},
): Promise<string[]> {
  return target.evaluate((field, settings) => {
    for (const animation of document.getAnimations()) animation.finish()
    const root = field.closest(settings.rootSelector)
    if (!root) throw new Error(`Missing field root: ${settings.rootSelector}`)
    const perimeter = new Set<Element>()
    let current: Element | null = field
    while (current) {
      perimeter.add(current)
      if (current === root) break
      current = current.parentElement
    }
    const activeCell = root.querySelector('[data-otp-cell][data-active]')
    if (activeCell) perimeter.add(activeCell)
    if (settings.includeDescendants) root.querySelectorAll('*').forEach((element) => perimeter.add(element))

    const paintsNothing = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (Number.parseFloat(getComputedStyle(node).opacity) === 0) return true
      }
      return false
    }
    const paintsFill = (element: Element) => {
      const style = getComputedStyle(element)
      if (style.backgroundImage !== 'none') return true
      const channels = style.backgroundColor.match(/[\d.]+/g)
      return !!channels && (channels.length < 4 || Number(channels[3]) > 0)
    }
    const coversBox = (child: Element, owner: Element) => {
      const inner = child.getBoundingClientRect()
      const outer = owner.getBoundingClientRect()
      return inner.left <= outer.left + 0.5 && inner.top <= outer.top + 0.5
        && inner.right >= outer.right - 0.5 && inner.bottom >= outer.bottom - 0.5
    }
    const isCoveredByFill = (owner: Element) => [...owner.querySelectorAll('*')]
      .some((child) => !paintsNothing(child) && paintsFill(child) && coversBox(child, owner))

    return [...perimeter].flatMap((element) => {
      if (paintsNothing(element)) return []
      const label = element.tagName.toLowerCase()
      return [null, '::before', '::after'].flatMap((pseudo) => {
        const style = getComputedStyle(element, pseudo)
        if (pseudo && (style.content === 'none' || style.content === 'normal' || Number.parseFloat(style.opacity) === 0)) return []
        const owner = `${label}${pseudo ?? ''}`
        const visible: string[] = []
        if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) visible.push(`${owner}:outline`)
        // WHY: box-shadow computes to none in forced colors https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties
        const rings = settings.forcedColors
          ? []
          : [...style.boxShadow.matchAll(/\b0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+(\d*\.?\d+)px\b/g)].filter((ring) => Number(ring[1]) > 0)
        const border = style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) > 0
        // WHY: Positioned perimeter pseudo-elements paint above the control fill that can cover the element's inset ring https://github.com/thomasluizon/orbit-tickets/issues/969
        if ((rings.length > 0 || border) && (pseudo || !isCoveredByFill(element))) {
          visible.push(...rings.map(() => `${owner}:shadow`))
          if (border) visible.push(`${owner}:border`)
        }
        return visible
      })
    })
  }, { rootSelector, includeDescendants: options.includeDescendants === true, forcedColors: options.forcedColors === true })
}

export async function expectOneFieldIndicator(
  page: Page,
  target: Locator,
  rootSelector: string,
  surface: string,
  options: FieldIndicatorOptions = {},
): Promise<void> {
  await expect(target).toBeVisible()
  await target.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
  const indicators = await readFieldIndicators(target, rootSelector, options)
  expect(indicators, `${surface} drew ${indicators.join(', ')}`).toHaveLength(1)
}

export async function inspectFocusedRing(page: Page) {
  return page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish()
    const focused = document.activeElement
    if (!(focused instanceof HTMLElement) || focused === document.body) return null

    const describe = (element: Element) => {
      const name = element.getAttribute('aria-label') ?? element.getAttribute('name') ?? ''
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${name ? `[${name}]` : ''}`
    }
    const ancestors: Element[] = []
    let parent = focused.parentElement
    for (let level = 0; level < 6 && parent; level += 1) {
      ancestors.push(parent)
      parent = parent.parentElement
    }
    const indicators = [focused, ...ancestors, ...focused.querySelectorAll('*')]
      .flatMap((element) => {
        return [null, '::before', '::after'].flatMap((pseudo) => {
          const style = getComputedStyle(element, pseudo)
          if (pseudo && (style.content === 'none' || style.content === 'normal' || Number.parseFloat(style.opacity) === 0)) return []
          const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
          return outline || style.boxShadow.includes('rgb(196, 83, 15)') ? [`${describe(element)}${pseudo ?? ''}`] : []
        })
      })

    return { focused: describe(focused), focusVisible: focused.matches(':focus-visible'), indicators }
  })
}

export async function inspectControlAccentRings(target: Locator) {
  return target.evaluate((control) => {
    for (const animation of document.getAnimations()) animation.finish()
    const bounds = control.getBoundingClientRect()
    const ancestors: Element[] = []
    for (let parent = control.parentElement; parent; parent = parent.parentElement) {
      const rect = parent.getBoundingClientRect()
      if (['top', 'right', 'bottom', 'left'].every((side) => Math.abs(rect[side as keyof DOMRect] as number - (bounds[side as keyof DOMRect] as number)) <= 8)) ancestors.push(parent)
    }
    const primary = getComputedStyle(control).getPropertyValue('--primary').trim()
    const probe = document.createElement('span')
    probe.style.color = primary
    control.appendChild(probe)
    const channels = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
    probe.remove()
    const accent = (color: string) => {
      const values = color.match(/[\d.]+/g)?.map(Number)
      return channels && values && channels.every((channel, index) => channel === values[index]) && (values[3] ?? 1) > 0
    }
    const visible = (element: Element) => {
      for (let owner: Element | null = element; owner; owner = owner.parentElement) {
        const style = getComputedStyle(owner)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      }
      return true
    }
    return [control, ...control.querySelectorAll('*'), ...ancestors].flatMap((element) => {
      if (!visible(element)) return []
      return [null, '::before', '::after'].flatMap((pseudo) => {
        const style = getComputedStyle(element, pseudo)
        if (pseudo && (['none', 'normal'].includes(style.content) || Number(style.opacity) === 0)) return []
        const label = `${element.tagName.toLowerCase()}${pseudo ?? ''}`
        const rings: string[] = []
        if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && accent(style.outlineColor)) rings.push(`${label}:outline`)
        for (const shadow of style.boxShadow.split(/,(?![^()]*\))/)) {
          const color = shadow.match(/rgba?\([^)]*\)/)?.[0]
          const lengths = shadow.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g)?.map(Number.parseFloat)
          if (color && accent(color) && lengths && lengths.length >= 4 && lengths[2] === 0 && lengths[3] !== 0) rings.push(`${label}:shadow`)
        }
        if (['Top', 'Right', 'Bottom', 'Left'].some((side) => Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && !['none', 'hidden'].includes(style.getPropertyValue(`border-${side.toLowerCase()}-style`)) && accent(style.getPropertyValue(`border-${side.toLowerCase()}-color`)))) rings.push(`${label}:border`)
        return rings
      })
    })
  })
}

export async function inspectFocusedControlRings(page: Page) {
  const focused = page.locator(':focus')
  if (await focused.count() !== 1) return null
  const state = await focused.evaluate((element) => ({ focused: element.tagName.toLowerCase(), focusVisible: element.matches(':focus-visible') }))
  return { ...state, indicators: await inspectControlAccentRings(focused) }
}

import { expect, type Locator, type Page } from '@playwright/test'

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
      const style = getComputedStyle(element)
      const label = element.tagName.toLowerCase()
      const visible: string[] = []
      if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) visible.push(`${label}:outline`)
      // WHY: box-shadow computes to none in forced colors https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties
      const rings = settings.forcedColors
        ? []
        : [...style.boxShadow.matchAll(/\b0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+(\d*\.?\d+)px\b/g)].filter((ring) => Number(ring[1]) > 0)
      const border = style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) > 0
      if ((rings.length > 0 || border) && !isCoveredByFill(element)) {
        visible.push(...rings.map(() => `${label}:shadow`))
        if (border) visible.push(`${label}:border`)
      }
      return visible
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

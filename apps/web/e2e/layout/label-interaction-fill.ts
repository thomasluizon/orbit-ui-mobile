import { expect, type Locator } from '@playwright/test'

async function readFill(control: Locator) {
  return control.evaluate((element) => {
    const fill = element.querySelector<HTMLElement>('[data-press-fill]') ?? element
    const bounds = fill.getBoundingClientRect()
    const style = getComputedStyle(fill)
    const controlBounds = element.getBoundingClientRect()
    const controlStyle = getComputedStyle(element)
    const content: DOMRect[] = [...fill.querySelectorAll('svg')].map((icon) => icon.getBoundingClientRect())
    const walker = document.createTreeWalker(fill, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim() || node.parentElement!.closest('svg, [aria-hidden="true"]')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      content.push(...range.getClientRects())
    }
    const pixels = (value: string) => Number.parseFloat(value) || 0
    const radius = (value: string, width: number, height: number) => Math.min(pixels(value), width / 2, height / 2)
    const pseudoHitExtensions = ['::before', '::after'].filter((pseudo) => {
      const pseudoStyle = getComputedStyle(element, pseudo)
      return !['none', 'normal'].includes(pseudoStyle.content) && pseudoStyle.position === 'absolute'
        && pseudoStyle.pointerEvents !== 'none'
        && [pseudoStyle.left, pseudoStyle.right, pseudoStyle.top, pseudoStyle.bottom].some((offset) => pixels(offset) < 0)
    })
    const paddings = content.filter((rect) => rect.width > 0).map((rect) => ({
      inline: Math.min(rect.left - bounds.left, bounds.right - rect.right),
      block: Math.min(rect.top - bounds.top, bounds.bottom - rect.bottom),
    }))
    return {
      background: style.backgroundColor, opacity: style.opacity,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
        .map((value) => radius(value, bounds.width, bounds.height)),
      controlRadii: [controlStyle.borderTopLeftRadius, controlStyle.borderTopRightRadius, controlStyle.borderBottomRightRadius, controlStyle.borderBottomLeftRadius]
        .map((value) => radius(value, bounds.width, bounds.height)),
      matchesHitArea: Math.abs(bounds.left - controlBounds.left) <= 1 && Math.abs(bounds.right - controlBounds.right) <= 1
        && Math.abs(bounds.top - controlBounds.top) <= 1 && Math.abs(bounds.bottom - controlBounds.bottom) <= 1,
      pseudoHitExtensions, paddings,
    }
  })
}

export async function expectFillShape(control: Locator, state: string) {
  const fill = await readFill(control)
  expect.soft(fill.matchesHitArea, `${state}: fill covers the control's entire hit area`).toBe(true)
  expect.soft(fill.background, `${state}: the fill paints a visible surface`).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/)
  for (const [index, radius] of fill.radii.entries()) {
    expect.soft(radius, `${state}: fill uses the control's corner radius`).toBeCloseTo(fill.controlRadii[index]!, 1)
  }
  expect.soft(fill.pseudoHitExtensions, `${state}: a hit extension must also carry the fill`).toEqual([])
  expect(fill.paddings.length, `${state}: visible content is measured`).toBeGreaterThan(0)
  for (const padding of fill.paddings) {
    expect.soft(padding.inline, `${state}: fill has inline breathing room`).toBeGreaterThanOrEqual(7.5)
    expect.soft(padding.block, `${state}: fill has block breathing room`).toBeGreaterThanOrEqual(3.5)
  }
}

export async function expectInteractionFill(control: Locator) {
  await expect(control).toBeVisible()
  await control.scrollIntoViewIfNeeded()
  await control.page().mouse.move(0, 0)
  const resting = await readFill(control)
  await control.hover()
  await expect.poll(async () => {
    const hovered = await readFill(control)
    return hovered.background !== resting.background || hovered.opacity !== resting.opacity
  }, { message: 'hover paints the control fill' }).toBe(true)
  await expectFillShape(control, 'hover')
  await control.page().mouse.down()
  try {
    await expect.poll(() => control.evaluate((element) => element.matches(':active'))).toBe(true)
    await expectFillShape(control, 'press')
  } finally {
    await control.page().mouse.move(0, 0)
    await control.page().mouse.up()
  }
}

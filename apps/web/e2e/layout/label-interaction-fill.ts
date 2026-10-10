import { settleAnimations } from './settle-animations'
import { expect, type Locator } from '@playwright/test'

async function settleFillTransitions(control: Locator) {
  await control.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  await control.evaluate(settleAnimations)
}

async function readFill(control: Locator) {
  return control.evaluate((element) => {
    function clipTextRect(rect: DOMRect, parent: Element | null) {
      let { left, right, top, bottom } = rect
      for (let ancestor = parent; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor)
        const clipsInline = ancestorStyle.overflowX !== 'visible' || ancestorStyle.textOverflow === 'ellipsis'
        const clipsBlock = ancestorStyle.overflowY !== 'visible'
        if (!clipsInline && !clipsBlock) continue
        const clip = ancestor.getBoundingClientRect()
        if (clipsInline) { left = Math.max(left, clip.left); right = Math.min(right, clip.right) }
        if (clipsBlock) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom) }
      }
      return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null
    }
    const fill = element.querySelector<HTMLElement>('[data-press-fill]') ?? element
    const bounds = fill.getBoundingClientRect()
    const style = getComputedStyle(fill)
    let effectiveOpacity = 1
    for (let ancestor: Element | null = fill; ancestor; ancestor = ancestor.parentElement) {
      effectiveOpacity *= Number.parseFloat(getComputedStyle(ancestor).opacity)
    }
    const controlBounds = element.getBoundingClientRect()
    const controlStyle = getComputedStyle(element)
    const visualContent = element.children.length ? element : element.parentElement!.querySelector('[data-personal-text-content]') ?? fill
    const content: DOMRect[] = [...visualContent.querySelectorAll('svg')].map((icon) => icon.getBoundingClientRect())
    const walker = document.createTreeWalker(visualContent, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim() || node.parentElement!.closest('svg')) continue
      if (node.parentElement!.closest('[aria-hidden="true"]:not([data-personal-text-visual-copy])')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        const clipped = clipTextRect(rect, node.parentElement)
        if (clipped) content.push(clipped)
      }
    }
    const pixels = (value: string) => Number.parseFloat(value) || 0
    const radius = (value: string, width: number, height: number) => Math.min(pixels(value), width / 2, height / 2)
    const extendedBounds = { left: controlBounds.left, right: controlBounds.right, top: controlBounds.top, bottom: controlBounds.bottom }
    const pseudoHitExtensions = ['::before', '::after'].filter((pseudo) => {
      const pseudoStyle = getComputedStyle(element, pseudo)
      const extendsTarget = !['none', 'normal'].includes(pseudoStyle.content) && pseudoStyle.position === 'absolute'
        && pseudoStyle.pointerEvents !== 'none'
        && [pseudoStyle.left, pseudoStyle.right, pseudoStyle.top, pseudoStyle.bottom].some((offset) => pixels(offset) < 0)
      if (!extendsTarget) return false
      const target = { left: controlBounds.left + pixels(pseudoStyle.left), right: controlBounds.right - pixels(pseudoStyle.right), top: controlBounds.top + pixels(pseudoStyle.top), bottom: controlBounds.bottom - pixels(pseudoStyle.bottom) }
      const painted = fill !== element && Object.entries(target).every(([edge, value]) => Math.abs(value - bounds[edge as 'left' | 'right' | 'top' | 'bottom']) <= 1)
      if (painted) Object.assign(extendedBounds, target)
      return !painted
    })
    const paddings = content.filter((rect) => rect.width > 0).map((rect) => ({
      inline: Math.min(rect.left - bounds.left, bounds.right - rect.right),
      block: Math.min(rect.top - bounds.top, bounds.bottom - rect.bottom),
    }))
    return {
      background: style.backgroundColor, opacity: style.opacity, effectiveOpacity,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
        .map((value) => radius(value, bounds.width, bounds.height)),
      controlRadii: [controlStyle.borderTopLeftRadius, controlStyle.borderTopRightRadius, controlStyle.borderBottomRightRadius, controlStyle.borderBottomLeftRadius]
        .map((value) => radius(value, bounds.width, bounds.height)),
      matchesHitArea: Math.abs(bounds.left - extendedBounds.left) <= 1 && Math.abs(bounds.right - extendedBounds.right) <= 1
        && Math.abs(bounds.top - extendedBounds.top) <= 1 && Math.abs(bounds.bottom - extendedBounds.bottom) <= 1,
      pseudoHitExtensions, paddings,
    }
  })
}

export async function expectFillShape(control: Locator, state: string) {
  const fill = await readFill(control)
  expect.soft(fill.matchesHitArea, `${state}: fill covers the control's entire hit area`).toBe(true)
  expect.soft(fill.background, `${state}: the fill paints a visible surface`).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/)
  expect.soft(fill.effectiveOpacity, `${state}: the fill has visible effective opacity`).toBeGreaterThan(0)
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
  await control.hover({ trial: true })
  const page = control.page()
  const overlays = page.locator('[role="menu"]:visible, [role="dialog"]:visible')
  const initialOverlayCount = await overlays.count()
  await page.mouse.move(0, 0)
  await settleFillTransitions(control)
  const resting = await readFill(control)
  await control.hover()
  await settleFillTransitions(control)
  await expect.poll(async () => {
    const hovered = await readFill(control)
    return hovered.background !== resting.background || hovered.opacity !== resting.opacity
  }, { message: 'hover paints the control fill' }).toBe(true)
  await expectFillShape(control, 'hover')
  try {
    await page.mouse.down()
    await expect.poll(() => control.evaluate((element) => element.matches(':active'))).toBe(true)
    await settleFillTransitions(control)
    await expectFillShape(control, 'press')
  } finally {
    await page.mouse.move(0, 0)
    await page.mouse.up()
    if (await overlays.count() > initialOverlayCount) {
      await page.keyboard.press('Escape')
      await expect(overlays).toHaveCount(initialOverlayCount)
    }
    await control.hover({ trial: true })
  }
}

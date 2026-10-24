import { settleAnimations } from './settle-animations'
import { expect, type Locator } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { readControlPaint } from './control-paint'

async function settleFillTransitions(control: Locator) {
  await control.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  await control.evaluate(settleAnimations)
}

async function readFill(control: Locator) {
  const paint = await control.evaluate(readControlPaint)
  return control.evaluate((element, { paint, clearance }) => {
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
    const { bounds, target } = paint
    const visualContent = element.parentElement?.hasAttribute('data-personal-text-action')
      ? element.parentElement.querySelector('[data-personal-text-content]')!
      : element
    const content: DOMRect[] = [...visualContent.querySelectorAll('svg')].map((icon) => icon.getBoundingClientRect())
    const walker = document.createTreeWalker(visualContent, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim() || node.parentElement!.closest('svg, [aria-hidden="true"]:not([data-personal-text-visual-copy])')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        const clipped = clipTextRect(rect, node.parentElement)
        if (clipped) content.push(clipped)
      }
    }
    const inlineInset = paint.reserveInline ? clearance : 0
    const blockInset = paint.reserveBlock ? clearance : 0
    const trailingInset = element.closest('.orbit-list-row-column:has(> .orbit-list-row-action)') ? 0 : inlineInset
    const paintsReach = Object.entries(target).every(([edge, value]) => Math.abs(bounds[edge as keyof typeof bounds] - value) <= 1)
    const paintTarget = [paint.reserveInline, paint.reserveBlock, paintsReach].includes(true) ? target : paint.control
    const paddings = content.filter((rect) => rect.width > 0).map((rect) => ({
      inline: Math.min(rect.left - bounds.left, bounds.right - rect.right),
      block: Math.min(rect.top - bounds.top, bounds.bottom - rect.bottom),
    }))
    return {
      ...paint,
      matchesHitArea: Math.abs(bounds.left - paintTarget.left - inlineInset) <= 1 && Math.abs(paintTarget.right - bounds.right - trailingInset) <= 1
        && Math.abs(bounds.top - paintTarget.top - blockInset) <= 1 && Math.abs(paintTarget.bottom - bounds.bottom - blockInset) <= 1,
      paddings,
    }
  }, { paint, clearance: INTERACTION_FILL_CLEARANCE })
}

export async function expectFillShape(control: Locator, state: string) {
  await expect.soft(async () => {
    const fill = await readFill(control)
    expect(fill.background, `${state}: the fill paints a visible surface`).not.toMatch(/^(transparent|rgba\([^)]*,\s*0\))$/)
    expect(fill.effectiveOpacity, `${state}: the fill has visible effective opacity`).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  const fill = await readFill(control)
  expect.soft(fill.matchesHitArea, `${state}: fill covers the control's reserved paint box`).toBe(true)
  for (const [index, radius] of fill.radii.entries()) {
    expect.soft(radius, `${state}: fill uses the control's corner radius`).toBeCloseTo(fill.controlRadii[index]!, 1)
  }
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
  }, { message: 'hover paints the control fill', timeout: 3000 }).toBe(true)
  await expectFillShape(control, 'hover')
  try {
    const menuTrigger = await control.evaluate((element) => element.hasAttribute('data-menu-trigger'))
    await page.mouse.down()
    await expect.poll(() => control.evaluate((element, menuTrigger) => menuTrigger
      ? element.getAttribute('data-state') === 'open' || element.getAttribute('aria-expanded') === 'true'
      : element.matches(':active'), menuTrigger),
    { message: 'control enters its observable press state' }).toBe(true)
    if (menuTrigger) await page.mouse.move(0, 0)
    await settleFillTransitions(control)
    await expectFillShape(control, 'press')
    await expect.poll(async () => (await readFill(control)).background,
      { message: 'press paints a fill distinct from rest', timeout: 3000 }).not.toBe(resting.background)
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

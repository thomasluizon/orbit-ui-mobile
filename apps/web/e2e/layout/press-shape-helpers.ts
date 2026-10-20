import { expect, type Locator } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { readControlPaint } from './control-paint'

async function readHitBoxOnceStill(control: Locator) {
  await expect(async () => {
    await control.scrollIntoViewIfNeeded()
    const first = await control.boundingBox()
    await control.page().waitForTimeout(250)
    expect(await control.boundingBox()).toEqual(first)
  }).toPass()
  return control.boundingBox()
}

async function waitForHoverStateToSettle(control: Locator, hovered: boolean) {
  await expect.poll(() => control.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const bounds = element.getBoundingClientRect()
    const topmost = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
    const animating = document.getAnimations().some((animation) => {
      const effect = animation.effect
      return effect instanceof KeyframeEffect && effect.target instanceof Element
        && (element.contains(effect.target) || effect.target.contains(element))
        && effect.getComputedTiming().endTime !== Infinity
        && (animation.pending || animation.playState === 'running' || animation.playState === 'paused')
    })
    return {
      topmost: element.contains(topmost),
      hovered: element.matches(':hover'),
      pressed: element.matches(':active'),
      animating,
    }
  }), { message: 'the hover target is settled and topmost' }).toEqual({
    topmost: true, hovered, pressed: false, animating: false,
  })
}

async function readTargetGeometry(control: Locator, fillPseudo?: '::after') {
  const paint = await control.evaluate(readControlPaint)
  return control.evaluate((element, { fillPseudo, paint }) => {
    const bounds = element.getBoundingClientRect()
    const smallPill = element.matches('.orbit-pill-action[data-size="sm"]')
    const hitChecks = [
      [bounds.left - 2, bounds.top + bounds.height / 2],
      [bounds.right + 1.99, bounds.top + bounds.height / 2],
      [bounds.left + bounds.width / 2, bounds.top - 2],
      [bounds.left + bounds.width / 2, bounds.bottom + 1.99],
    ].map(([x, y]) => element.contains(document.elementFromPoint(x!, y!)))
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
    const fill = element.querySelector('[data-press-fill]') ?? element
    const fillStyle = getComputedStyle(fill, fillPseudo)
    const fillBox = fillPseudo ? {
      left: bounds.left + pixels(fillStyle.left), top: bounds.top + pixels(fillStyle.top),
      right: bounds.right - pixels(fillStyle.right), bottom: bounds.bottom - pixels(fillStyle.bottom),
      width: bounds.width - pixels(fillStyle.left) - pixels(fillStyle.right),
      height: bounds.height - pixels(fillStyle.top) - pixels(fillStyle.bottom),
    } : { ...paint.bounds, width: paint.bounds.right - paint.bounds.left, height: paint.bounds.bottom - paint.bounds.top }
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--bg-hover)'
    element.append(probe)
    const hoverFill = getComputedStyle(probe).backgroundColor
    probe.style.backgroundColor = 'var(--bg-hover-opaque)'
    const opaqueHoverFill = getComputedStyle(probe).backgroundColor
    probe.remove()
    return {
      smallPill, hitChecks, reserveInline: paint.reserveInline, reserveBlock: paint.reserveBlock,
      hoverFill,
      opaqueHoverFill,
      hit,
      painted: { left: fillBox.left, top: fillBox.top, right: fillBox.right, bottom: fillBox.bottom },
      width: fillBox.width,
      height: fillBox.height,
      background: fillPseudo ? fillStyle.backgroundColor : paint.background,
      opacity: fillPseudo ? fillStyle.opacity : paint.opacity,
      radius: fillPseudo ? Math.min(pixels(fillStyle.borderTopLeftRadius), fillBox.width / 2, fillBox.height / 2) : paint.radii[0]!,
    }
  }, { fillPseudo: fillPseudo ?? null, paint })
}

function paintEdgeInset(edge: 'left' | 'top' | 'right' | 'bottom', smallPill: boolean, reserved: boolean) {
  const inset = smallPill ? 2 : reserved ? INTERACTION_FILL_CLEARANCE : 0
  return edge === 'left' || edge === 'top' ? inset : -inset
}

export async function expectHoverOnHitArea(control: Locator, radius: 'pill' | 8 | 12 | 20, fillToken?: '--bg-hover' | '--bg-hover-opaque', fillPseudo?: '::after') {
  await expect(control).toBeVisible()
  await readHitBoxOnceStill(control)
  await control.page().mouse.move(0, 0)
  await waitForHoverStateToSettle(control, false)
  const resting = await readTargetGeometry(control, fillPseudo)
  await control.hover()
  await waitForHoverStateToSettle(control, true)
  await expect.poll(async () => {
    const hovered = await readTargetGeometry(control, fillPseudo)
    return hovered.background !== resting.background || hovered.opacity !== resting.opacity
  }, { message: 'the painted hit area responds to hover' }).toBe(true)
  const geometry = await readTargetGeometry(control, fillPseudo)
  if (fillToken) expect(geometry.background, `the interaction uses ${fillToken}`).toBe(fillToken === '--bg-hover-opaque' ? geometry.opaqueHoverFill : geometry.hoverFill)
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    const reserved = edge === 'left' || edge === 'right' ? geometry.reserveInline : geometry.reserveBlock
    const paintInset = paintEdgeInset(edge, geometry.smallPill, reserved)
    expect(geometry.painted[edge], `the fill reaches the ${edge} paint edge`).toBeCloseTo(geometry.hit[edge] + paintInset, 1)
    if (geometry.smallPill) expect(geometry.hitChecks).toEqual([true, true, true, true])
  }
  expect(geometry.radius).toBeCloseTo(radius === 'pill' ? Math.min(geometry.width, geometry.height) / 2 : radius, 1)
}

export async function expectFullTouchTarget(control: Locator, radius: 'pill' | 8 | 12, fillToken?: '--bg-hover' | '--bg-hover-opaque', fillPseudo?: '::after') {
  await expectHoverOnHitArea(control, radius, fillToken, fillPseudo)
  const geometry = await readTargetGeometry(control, fillPseudo)
  expect(geometry.hit.right - geometry.hit.left).toBeGreaterThanOrEqual(48)
  expect(geometry.hit.bottom - geometry.hit.top).toBeGreaterThanOrEqual(48)
}

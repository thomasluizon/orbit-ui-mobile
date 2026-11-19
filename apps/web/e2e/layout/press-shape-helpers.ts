import { expect, type Locator } from '@playwright/test'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { readControlPaint } from './control-paint'
import { readControlHitArea } from '../../test-support/control-hit-area'

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

export async function readTargetGeometry(control: Locator) {
  const paint = await control.evaluate(readControlPaint)
  const hit = await control.evaluate(readControlHitArea)
  return control.evaluate((element, { paint, hit }) => {
    const smallPill = element.matches('.orbit-pill-action[data-size="sm"]')
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--bg-hover)'
    element.append(probe)
    const hoverFill = getComputedStyle(probe).backgroundColor
    probe.style.backgroundColor = 'var(--bg-hover-opaque)'
    const opaqueHoverFill = getComputedStyle(probe).backgroundColor
    probe.remove()
    return {
      smallPill, hitChecks: hit.checks, reserveInline: paint.reserveInline, reserveBlock: paint.reserveBlock,
      hoverFill,
      opaqueHoverFill,
      hit,
      painted: { left: paint.bounds.left, top: paint.bounds.top, right: paint.bounds.right, bottom: paint.bounds.bottom },
      width: paint.bounds.right - paint.bounds.left,
      height: paint.bounds.bottom - paint.bounds.top,
      background: paint.background,
      opacity: paint.opacity,
      radius: paint.radii[0]!,
    }
  }, { paint, hit })
}

function paintEdgeInset(edge: 'left' | 'top' | 'right' | 'bottom', smallPill: boolean, reserved: boolean) {
  const inset = smallPill ? 2 : reserved ? INTERACTION_FILL_CLEARANCE : 0
  return edge === 'left' || edge === 'top' ? inset : -inset
}

export async function expectHoverOnHitArea(control: Locator, radius: 'pill' | 8 | 12 | 20, fillToken?: '--bg-hover' | '--bg-hover-opaque') {
  await expect(control).toBeVisible()
  await readHitBoxOnceStill(control)
  await control.page().mouse.move(0, 0)
  await waitForHoverStateToSettle(control, false)
  const resting = await readTargetGeometry(control)
  await control.hover()
  await waitForHoverStateToSettle(control, true)
  await expect.poll(async () => {
    const hovered = await readTargetGeometry(control)
    return hovered.background !== resting.background || hovered.opacity !== resting.opacity
  }, { message: 'the painted hit area responds to hover' }).toBe(true)
  const geometry = await readTargetGeometry(control)
  if (fillToken) expect(geometry.background, `the interaction uses ${fillToken}`).toBe(fillToken === '--bg-hover-opaque' ? geometry.opaqueHoverFill : geometry.hoverFill)
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    const reserved = edge === 'left' || edge === 'right' ? geometry.reserveInline : geometry.reserveBlock
    const paintInset = paintEdgeInset(edge, geometry.smallPill, reserved)
    expect(geometry.painted[edge], `the fill reaches the ${edge} paint edge`).toBeCloseTo(geometry.hit[edge] + paintInset, 1)
    if (geometry.smallPill) expect(geometry.hitChecks).toEqual([true, true, true, true])
  }
  expect(geometry.radius).toBeCloseTo(radius === 'pill' ? Math.min(geometry.width, geometry.height) / 2 : radius, 1)
}

export async function expectFullTouchTarget(control: Locator, radius: 'pill' | 8 | 12, fillToken?: '--bg-hover' | '--bg-hover-opaque') {
  await expectHoverOnHitArea(control, radius, fillToken)
  const geometry = await readTargetGeometry(control)
  expect(geometry.hit.right - geometry.hit.left).toBeGreaterThanOrEqual(48)
  expect(geometry.hit.bottom - geometry.hit.top).toBeGreaterThanOrEqual(48)
}

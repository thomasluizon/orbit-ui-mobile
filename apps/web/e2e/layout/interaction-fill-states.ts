import { expect, type Locator, type Page } from '@playwright/test'
import { inspectInteractionFill } from './interaction-fill-geometry'
import { settleAnimations } from './settle-animations'

const ACTION_TIMEOUT_MS = 2000

class ActionTimeout extends Error {}

async function runAction<Result>(context: string, state: string, action: () => Promise<Result>, retryRead = false): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ActionTimeout(`action exceeded ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS)
      }),
    ])
  } catch (cause) {
    if (retryRead && cause instanceof ActionTimeout) return runAction(context, state, action)
    throw new Error(`${context} ${state}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  } finally { clearTimeout(timer) }
}

async function reachedControl(page: Page, control: Locator, context: string) {
  const retainsFocus = await runAction(context, 'read active control', () => control.evaluate((element) => document.activeElement === element, undefined, { timeout: ACTION_TIMEOUT_MS }), true)
  if (retainsFocus) return control
  expect(await runAction(context, 'read transferred control visibility', () => control.isVisible()), `${context} lost focus without entering another layer`).toBe(false)
  const focused = page.locator(':focus:visible')
  expect(await runAction(context, 'read reached control', () => focused.count()), context).toBe(1)
  return focused
}

async function dismissEnteredOverlay(page: Page, overlays: Locator, existing: number, context: string) {
  if (await runAction(context, 'read entered overlays', () => overlays.count()) <= existing) return
  await runAction(context, 'dismiss entered overlay', () => page.keyboard.press('Escape'))
  await runAction(context, 'wait for overlay dismissal', () => expect(overlays).toHaveCount(existing, { timeout: ACTION_TIMEOUT_MS }))
}

async function inViewport(control: Locator, fully = false) {
  return control.evaluate((element, fully) => {
    const box = element.getBoundingClientRect()
    if (fully) return box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
    return box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight
  }, fully, { timeout: ACTION_TIMEOUT_MS })
}

async function checkState(control: Locator, context: string, clearance: number) {
  await runAction(context, 'settle state frame', () => control.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), undefined, { timeout: ACTION_TIMEOUT_MS }))
  await runAction(context, 'settle paint', () => control.evaluate(settleAnimations, undefined, { timeout: ACTION_TIMEOUT_MS }))
  const result = await runAction(context, 'measure paint', () => control.evaluate(inspectInteractionFill, clearance, { timeout: ACTION_TIMEOUT_MS }))
  expect(result.violations, `${context}: ${result.control}`).toEqual([])
}

async function inspectControl(page: Page, control: Locator, context: string, clearance: number) {
  const sentinel = await runAction(context, 'read focus guard', () => control.evaluate((element) => element.matches('[data-base-ui-focus-guard], [data-radix-focus-guard]'), undefined, { timeout: ACTION_TIMEOUT_MS }))
  if (sentinel) return false
  const name = await runAction(context, 'identify control', () => control.evaluate((element) => {
    const classes = [...element.classList].filter((name) => name.startsWith('orbit-')).map((name) => `.${name}`).join('')
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${classes}[${element.getAttribute('aria-label') ?? element.textContent.trim().replace(/\s+/g, ' ').slice(0, 100)}]`
  }, undefined, { timeout: ACTION_TIMEOUT_MS }))
  context = `${context}, ${name}`
  const overlays = page.locator('[role="menu"]:visible, [role="dialog"]:visible, [role="listbox"]:visible')
  const existingOverlays = await runAction(context, 'read overlays', () => overlays.count())
  await runAction(context, 'scroll into view', () => control.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS }))
  if (await runAction(context, 'read pointer bounds', () => inViewport(control))) {
    await runAction(context, 'hover', () => control.hover({ timeout: ACTION_TIMEOUT_MS }))
    await checkState(control, `${context} hover`, clearance)
    try {
      await runAction(context, 'press', () => page.mouse.down())
      const pressed = await runAction(context, 'read pressed visibility', () => control.isVisible()) ? control : await reachedControl(page, control, context)
      await checkState(pressed, `${context} press`, clearance)
    } finally {
      await runAction(context, 'move before release', () => page.mouse.move(0, 0))
      await runAction(context, 'release press', () => page.mouse.up())
      await dismissEnteredOverlay(page, overlays, existingOverlays, context)
    }
  }
  await runAction(context, 'reset pointer focus', () => control.blur({ timeout: ACTION_TIMEOUT_MS }))
  await runAction(context, 'keyboard modality', () => page.keyboard.press('Shift'))
  await runAction(context, 'focus-visible', () => control.focus({ timeout: ACTION_TIMEOUT_MS }))
  const focused = await reachedControl(page, control, context)
  await runAction(context, 'focus-visible bounds', async () => {
    await focused.evaluate(settleAnimations, undefined, { timeout: ACTION_TIMEOUT_MS })
    if (!await inViewport(focused, true)) throw new Error('control remains outside the viewport after focus')
    await expect.poll(() => focused.evaluate((element) => element.matches(':focus-visible'), undefined, { timeout: ACTION_TIMEOUT_MS }), { message: context, timeout: ACTION_TIMEOUT_MS }).toBe(true)
  })
  await checkState(focused, `${context} focus-visible`, clearance)
  await runAction(context, 'blur', () => focused.blur({ timeout: ACTION_TIMEOUT_MS }))
  await dismissEnteredOverlay(page, overlays, existingOverlays, context)
  return true
}

export async function inspectControls(page: Page, controls: Locator, context: string, clearance: number,
  counts = { inspectedControls: 0, skippedSentinels: 0 }) {
  const inventory = await runAction(context, 'capture control inventory', () => controls.evaluateAll((elements) => elements.map((element, index) => {
    element.setAttribute('data-interaction-fill-probe', String(index))
    return String(index)
  })))
  const captured = page.locator('[data-interaction-fill-probe]')
  const inspect = async (control: Locator, label: string) => {
    if (await inspectControl(page, control, label, clearance)) counts.inspectedControls++
    else counts.skippedSentinels++
  }
  const title = captured.and(page.locator('.orbit-habit-rename'))
  if (await runAction(context, 'find habit title', () => title.count())) await inspect(title, context)
  for (const index of inventory) {
    const control = page.locator(`[data-interaction-fill-probe="${index}"]`)
    if (await runAction(context, 'read title priority', () => control.evaluate((element) => element.matches('.orbit-habit-rename'), undefined, { timeout: ACTION_TIMEOUT_MS }))) continue
    await inspect(control, `${context}, control ${index}`)
  }
  return counts
}

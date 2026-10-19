import { expect, type Locator, type Page } from '@playwright/test'
import { inspectInteractionFill } from './interaction-fill-geometry'
import { settleAnimations } from './settle-animations'

const ACTION_TIMEOUT_MS = 2000

async function runAction<Result>(context: string, state: string, action: () => Promise<Result>): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`action exceeded ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS)
      }),
    ])
  } catch (cause) {
    throw new Error(`${context} ${state}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  } finally { clearTimeout(timer) }
}

async function inViewport(control: Locator) {
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight
  }, undefined, { timeout: ACTION_TIMEOUT_MS })
}

async function checkState(control: Locator, context: string, clearance: number) {
  await runAction(context, 'settle paint', () => control.evaluate(settleAnimations, undefined, { timeout: ACTION_TIMEOUT_MS }))
  const result = await runAction(context, 'measure paint', () => control.evaluate(inspectInteractionFill, clearance, { timeout: ACTION_TIMEOUT_MS }))
  expect(result.violations, `${context}: ${result.control}`).toEqual([])
}

async function inspectControl(page: Page, control: Locator, context: string, clearance: number) {
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
      await checkState(control, `${context} press`, clearance)
    } finally {
      await runAction(context, 'move before release', () => page.mouse.move(0, 0))
      await runAction(context, 'release press', () => page.mouse.up())
      if (await runAction(context, 'read pressed overlays', () => overlays.count()) > existingOverlays) {
        await runAction(context, 'dismiss pressed overlay', () => page.keyboard.press('Escape'))
        await runAction(context, 'wait for overlay dismissal', () => expect(overlays).toHaveCount(existingOverlays, { timeout: ACTION_TIMEOUT_MS }))
      }
    }
  }
  await runAction(context, 'keyboard modality', () => page.keyboard.press('Tab'))
  await runAction(context, 'focus-visible', () => control.focus({ timeout: ACTION_TIMEOUT_MS }))
  await runAction(context, 'focus-visible bounds', async () => {
    await control.evaluate(settleAnimations, undefined, { timeout: ACTION_TIMEOUT_MS })
    if (!await inViewport(control)) throw new Error('control remains outside the viewport after focus')
    expect(await control.evaluate((element) => element.matches(':focus-visible'), undefined, { timeout: ACTION_TIMEOUT_MS }), context).toBe(true)
  })
  await checkState(control, `${context} focus-visible`, clearance)
  await runAction(context, 'blur', () => control.blur({ timeout: ACTION_TIMEOUT_MS }))
}

export async function inspectControls(page: Page, controls: Locator, context: string, clearance: number) {
  const title = controls.and(page.locator('.orbit-habit-rename'))
  if (await runAction(context, 'find habit title', () => title.count())) await inspectControl(page, title, context, clearance)
  const remaining = controls.and(page.locator(':not(.orbit-habit-rename)'))
  const count = await runAction(context, 'count controls', () => remaining.count())
  for (let index = 0; index < count; index++) await inspectControl(page, remaining.nth(index), `${context}, control ${index}`, clearance)
}

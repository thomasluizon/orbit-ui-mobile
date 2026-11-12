import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { Locator, Page } from '@playwright/test'
import type { ButtonVariant } from '@orbit/shared/theme'
import { PillButton, PillLink } from '@/components/ui/pill-button'
import { Fab } from '@/components/ui/fab'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive', 'caution']

/** The press fill of each variant, as the mobile `PillButton` paints it. */
const pressFills: Record<ButtonVariant, string> = {
  primary: 'var(--primary-pressed)',
  secondary: 'color-mix(in srgb, var(--fg-1) 90%, var(--bg))',
  ghost: 'var(--bg-hover)',
  destructive: 'color-mix(in srgb, var(--status-bad) 85%, var(--fg-1))',
  caution: 'color-mix(in srgb, var(--status-overdue) 85%, black)',
}

const controls = [
  ...variants.map((variant) => ({ role: 'button' as const, name: `${variant} button`, fill: pressFills[variant], pill: true })),
  ...variants.map((variant) => ({ role: 'link' as const, name: `${variant} link`, fill: pressFills[variant], pill: true })),
  { role: 'button' as const, name: 'Create habit', fill: pressFills.primary, pill: false },
]

function pressControls() {
  return <>
    {variants.map((variant) => <PillButton key={`button-${variant}`} variant={variant} onClick={() => {}}>{`${variant} button`}</PillButton>)}
    {variants.map((variant) => <PillLink key={`link-${variant}`} href={`/${variant}`} variant={variant}>{`${variant} link`}</PillLink>)}
    <Fab label="Create habit" onClick={() => {}}>+</Fab>
  </>
}

async function resolvedFill(page: Page, fill: string) {
  return page.evaluate((fill) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = fill
    document.body.append(probe)
    const resolved = getComputedStyle(probe).backgroundColor
    probe.remove()
    return resolved
  }, fill)
}

function readPress(element: Element) {
  const style = getComputedStyle(element)
  const properties = style.transitionProperty.split(', ')
  const durations = style.transitionDuration.split(', ')
  return { fill: style.backgroundColor, scale: style.scale, scaleDuration: durations[properties.indexOf('scale') % durations.length] }
}

async function holdControl(page: Page, control: Locator, hasTouch: boolean) {
  await page.evaluate(() => { delete document.documentElement.dataset.pointerType })
  if (!hasTouch) {
    await control.hover()
    await page.mouse.down()
    expect(await page.locator('html').getAttribute('data-pointer-type')).toBe('mouse')
    return async () => {
      await page.mouse.move(1, 1)
      await page.mouse.up()
    }
  }
  await control.scrollIntoViewIfNeeded()
  const bounds = await control.boundingBox()
  expect(bounds, 'touch target bounds').not.toBeNull()
  const session = await page.context().newCDPSession(page)
  const x = bounds!.x + bounds!.width / 2
  const y = bounds!.y + bounds!.height / 2
  await session.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' })
  void session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }).catch(() => {})
  await expect.poll(() => page.locator('html').getAttribute('data-pointer-type')).toBe('touch')
  return async () => {
    void session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }).catch(() => {})
    await session.send('Emulation.setEmitTouchEventsForMouse', { enabled: false })
    await page.mouse.move(1, 1)
    await session.detach()
  }
}

describe('pill press fill in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function mountControls(page: Page, mode: 'dark' | 'light') {
    const { container, unmount } = render(pressControls())
    const markup = container.innerHTML
    unmount()
    const declarations = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
    await page.setContent(`<!doctype html><style>${stylesheet}:root{${declarations}} body{padding:32px;display:flex;flex-direction:column;align-items:flex-start;gap:16px}</style>${markup}`)
    await page.evaluate(() => {
      document.addEventListener('pointerdown', (event) => { document.documentElement.dataset.pointerType = event.pointerType }, true)
      document.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
      })
    })
  }

  for (const mode of ['dark', 'light'] as const) {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      for (const hasTouch of [false, true]) {
        it(`paints the mobile press fill during a ${hasTouch ? 'touch' : 'hovering mouse'} press in ${mode} with ${reducedMotion} motion`, async () => {
          const page = await browser.newPage({ reducedMotion, hasTouch, viewport: { width: 412, height: 1200 } })
          try {
            await mountControls(page, mode)
            for (const { role, name, fill, pill } of controls) {
              const control = page.getByRole(role, { name, exact: true })
              const rest = await control.evaluate(readPress)
              const pressedFill = await resolvedFill(page, fill)
              expect(rest.fill, `${name} rest differs from its press fill`).not.toBe(pressedFill)
              if (pill && reducedMotion === 'no-preference') expect(rest.scaleDuration, `${name} scale duration`).toBe('0.15s')
              const release = await holdControl(page, control, hasTouch)
              await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor), { message: `${name} press fill` }).toBe(pressedFill)
              if (reducedMotion === 'reduce') expect((await control.evaluate(readPress)).scale, `${name} reduced motion scale`).toBe('none')
              else await expect.poll(() => control.evaluate((element) => getComputedStyle(element).scale), { message: `${name} press scale` }).toBe('0.96')
              await release()
              await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor), { message: `${name} release` }).toBe(rest.fill)
            }
          } finally { await page.close() }
        })
      }
    }
  }
})

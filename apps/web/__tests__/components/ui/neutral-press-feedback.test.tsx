import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { Locator, Page } from '@playwright/test'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { SelectionTray } from '@/components/habits/selection-tray'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { PillButton, PillLink } from '@/components/ui/pill-button'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const noop = () => {}

function feedbackControls(allSelected: boolean, unavailable = false, completionReadOnly = false) {
  return <>
    <SelectionTray selectedCount={unavailable ? 0 : 2} allSelected={allSelected} completionReadOnly={completionReadOnly}
      onSelectAll={noop} onDeselectAll={noop} onBulkLog={noop} onBulkSkip={noop} onBulkDelete={noop} onCancel={noop} />
    <AstraAllowancePanel profile={createMockProfile()} />
    <PillButton variant="ghost" disabled={unavailable}>Ghost</PillButton>
    <div style={{ background: 'var(--bg-elev)' }}><PromptQuietAction disabled={unavailable}>Quiet</PromptQuietAction></div>
    <PillButton variant="ghost" loading>Saving</PillButton>
    <PillLink href="/upgrade" variant="ghost">Ghost link</PillLink>
  </>
}

function readPaintedFill(element: Element) {
  const layer = element.querySelector('[data-press-fill]')
  if (layer && getComputedStyle(layer).opacity !== '0') return getComputedStyle(layer).backgroundColor
  return getComputedStyle(element).backgroundColor
}

function measureControl(element: Element) {
  const style = getComputedStyle(element)
  const bounds = element.getBoundingClientRect()
  const layer = element.querySelector('[data-press-fill]')
  const fill = layer && getComputedStyle(layer).opacity !== '0' ? getComputedStyle(layer).backgroundColor : style.backgroundColor
  return { fill, width: bounds.width, height: bounds.height, scale: style.scale, radius: style.borderTopLeftRadius, overflow: style.overflow }
}

async function expectFill(control: Locator, fill: string, label: string) {
  await expect.poll(() => control.evaluate(readPaintedFill), { message: label }).toBe(fill)
}

async function holdControl(page: Page, control: Locator, hasTouch: boolean) {
  await page.evaluate(() => {
    delete document.documentElement.dataset.pointerType
    delete document.documentElement.dataset.pointerReleaseType
  })
  if (!hasTouch) {
    await control.hover()
    await page.mouse.down()
    expect(await page.locator('html').getAttribute('data-pointer-type')).toBe('mouse')
    return async (afterLift?: () => Promise<void>) => {
      await page.mouse.move(1, 1)
      await page.mouse.up()
      await afterLift?.()
    }
  }
  await control.scrollIntoViewIfNeeded()
  const bounds = await control.boundingBox()
  expect(bounds, 'touch target bounds').not.toBeNull()
  const session = await page.context().newCDPSession(page)
  const x = bounds!.x + bounds!.width / 2
  const y = bounds!.y + bounds!.height / 2
  await session.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' })
  void session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
  }).catch(() => {})
  await expect.poll(() => page.locator('html').getAttribute('data-pointer-type')).toBe('touch')
  return async (afterLift?: () => Promise<void>) => {
    void session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1,
    }).catch(() => {})
    await expect.poll(() => page.locator('html').getAttribute('data-pointer-release-type')).toBe('touch')
    await afterLift?.()
    await session.send('Emulation.setEmitTouchEventsForMouse', { enabled: false })
    await page.mouse.move(1, 1)
    await session.detach()
  }
}

async function neutralFill(page: Page, opaque = false) {
  return page.evaluate((opaque) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = opaque ? 'var(--bg-hover-opaque)' : 'var(--bg-hover)'
    document.body.append(probe)
    const fill = getComputedStyle(probe).backgroundColor
    probe.remove()
    return fill
  }, opaque)
}

describe('neutral press feedback in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function mountControls(page: Page, mode: 'dark' | 'light', allSelected: boolean, unavailable = false, completionReadOnly = false) {
    const { container, unmount } = render(feedbackControls(allSelected, unavailable, completionReadOnly))
    const tray = container.querySelector<HTMLElement>('[data-testid="bulk-action-bar"]')!
    tray.style.opacity = '1'
    tray.style.transform = 'none'
    const markup = container.innerHTML
    unmount()
    const variables = resolveWebThemeVariables('orange', mode)
    const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value};`).join('')
    await page.setContent(`<!doctype html><style>${stylesheet}:root{${declarations}} body{padding:32px}</style>${markup}`)
    await page.evaluate(() => {
      document.addEventListener('pointerdown', (event) => {
        document.documentElement.dataset.pointerType = event.pointerType
      }, true)
      document.addEventListener('pointerup', (event) => {
        document.documentElement.dataset.pointerReleaseType = event.pointerType
      }, true)
      document.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
      })
    })
    await loadAppFonts(page)
  }

  for (const mode of ['dark', 'light'] as const) {
    for (const hasTouch of [false, true]) {
      it.each([false, true])(`paints rest, press and release in ${mode}, touch: ${hasTouch}, allSelected: %s with reduced motion`, async (allSelected) => {
        const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch, viewport: { width: 412, height: 1200 } })
        try {
          await mountControls(page, mode, allSelected)
          const expectedFill = await neutralFill(page)
          for (const label of [allSelected ? 'common.deselectAll' : 'common.selectAll', 'habits.bulkBar.log', 'habits.bulkBar.skip', 'habits.bulkBar.delete', 'common.cancel', 'Ghost', 'Quiet', 'Ghost link', 'profile.allowance.seePro']) {
            const control = page.getByRole(label.includes('link') || label.startsWith('profile.') ? 'link' : 'button', { name: label, exact: true })
            const onSheet = ['common.selectAll', 'common.deselectAll', 'habits.bulkBar.log', 'habits.bulkBar.skip', 'habits.bulkBar.delete', 'common.cancel', 'Quiet'].includes(label)
            const expectedControlFill = onSheet ? await neutralFill(page, true) : expectedFill
            const rest = await control.evaluate(measureControl)
            const restingColor = await control.evaluate((element) => getComputedStyle(element).color)
            expect(rest.fill, `${label} rest`).toBe('rgba(0, 0, 0, 0)')
            expect(rest.width, `${label} width`).toBeGreaterThanOrEqual(44)
            expect(rest.height, `${label} height`).toBeGreaterThanOrEqual(44)
            expect(rest.overflow, `${label} clipping`).toBe('hidden')
            expect(Number.parseFloat(rest.radius), `${label} radius`).toBeGreaterThan(0)
            if (label === 'common.selectAll' || label === 'common.deselectAll') expect(Math.min(Number.parseFloat(rest.radius), rest.width / 2, rest.height / 2)).toBe(Math.min(rest.width, rest.height) / 2)
            if (!hasTouch) {
              await control.hover()
              await expectFill(control, expectedControlFill, `${label} hover`)
            }
            const release = await holdControl(page, control, hasTouch)
            await expectFill(control, expectedControlFill, `${label} press`)
            expect(await control.evaluate(measureControl), `${label} pressed geometry`).toEqual({ ...rest, fill: expectedControlFill })
            if (label === 'common.selectAll' || label === 'common.deselectAll') {
              const foreground = await control.evaluate((element) => getComputedStyle(element).color)
              const variables = resolveWebThemeVariables('orange', mode)
              expect(contrastOnSurface(foreground, [variables['--bg']!, variables['--bg-sheet']!, expectedControlFill])).toBeGreaterThanOrEqual(4.5)
            }
            await release(() => expectFill(control, rest.fill, `${label} release`))
            expect(await control.evaluate(measureControl), `${label} restored geometry`).toEqual(rest)
            expect(await control.evaluate((element) => getComputedStyle(element).color), `${label} restored text`).toBe(restingColor)
          }
        } finally { await page.close() }
      })
    }

    it.each([false, true])(`paints keyboard press and release in ${mode} (allSelected: %s)`, async (allSelected) => {
      const page = await browser.newPage({ reducedMotion: 'reduce' })
      try {
        await mountControls(page, mode, allSelected)
        const label = allSelected ? 'common.deselectAll' : 'common.selectAll'
        const control = page.getByRole('button', { name: label, exact: true })
        await control.focus()
        const rest = await control.evaluate(measureControl)
        const restingColor = await control.evaluate((element) => getComputedStyle(element).color)
        await page.keyboard.down('Space')
        const fill = await neutralFill(page, true)
        await expectFill(control, fill, `${label} keyboard press`)
        const foreground = await control.evaluate((element) => getComputedStyle(element).color)
        const variables = resolveWebThemeVariables('orange', mode)
        expect(contrastOnSurface(foreground, [variables['--bg']!, variables['--bg-sheet']!, fill])).toBeGreaterThanOrEqual(4.5)
        expect(await control.evaluate(measureControl)).toEqual({ ...rest, fill })
        await page.keyboard.up('Space')
        await expectFill(control, rest.fill, `${label} keyboard release`)
        expect(await control.evaluate((element) => getComputedStyle(element).color)).toBe(restingColor)
      } finally { await page.close() }
    })

    it.each([false, true])(`keeps disabled and loading controls at rest in ${mode} (allSelected: %s)`, async (allSelected) => {
      const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch: true })
      try {
        await mountControls(page, mode, allSelected, true)
        for (const label of ['habits.bulkBar.log', 'habits.bulkBar.skip', 'habits.bulkBar.delete', 'Ghost', 'Quiet', 'Saving']) {
          const control = page.getByRole('button', { name: label, exact: true })
          const rest = await control.evaluate(measureControl)
          expect(await control.isDisabled(), label).toBe(true)
          const release = await holdControl(page, control, true)
          expect(await control.evaluate(measureControl), `${label} disabled press`).toEqual(rest)
          await release(async () => {
            expect(await control.evaluate(measureControl), `${label} disabled release`).toEqual(rest)
          })
        }
      } finally { await page.close() }
    })

    it(`keeps read-only completion controls at rest while delete remains enabled in ${mode}`, async () => {
      const page = await browser.newPage({ reducedMotion: 'reduce', hasTouch: true })
      try {
        await mountControls(page, mode, false, false, true)
        for (const label of ['habits.bulkBar.log', 'habits.bulkBar.skip']) {
          const control = page.getByRole('button', { name: label, exact: true })
          expect(await control.getAttribute('aria-disabled')).toBe('true')
          const rest = await control.evaluate(measureControl)
          const release = await holdControl(page, control, true)
          expect(await control.evaluate(measureControl), `${label} read-only press`).toEqual(rest)
          await release(async () => {
            expect(await control.evaluate(measureControl), `${label} read-only release`).toEqual(rest)
          })
        }
        const remove = page.getByRole('button', { name: 'habits.bulkBar.delete', exact: true })
        expect(await remove.isDisabled()).toBe(false)
        const release = await holdControl(page, remove, true)
        await expectFill(remove, await neutralFill(page, true), 'read-only delete press')
        await release(() => expectFill(remove, 'rgba(0, 0, 0, 0)', 'read-only delete release'))
      } finally { await page.close() }
    })
  }
})

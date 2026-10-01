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
    <PillButton variant="ghost" quiet disabled={unavailable}>Quiet</PillButton>
    <PillButton variant="ghost" loading>Saving</PillButton>
    <PillLink href="/upgrade" variant="ghost">Ghost link</PillLink>
  </>
}

function measureControl(element: Element) {
  const style = getComputedStyle(element)
  const bounds = element.getBoundingClientRect()
  return { fill: style.backgroundColor, width: bounds.width, height: bounds.height, scale: style.scale }
}

async function expectFill(control: Locator, fill: string, label: string) {
  await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor), { message: label }).toBe(fill)
}

async function neutralFill(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--bg-hover)'
    document.body.append(probe)
    const fill = getComputedStyle(probe).backgroundColor
    probe.remove()
    return fill
  })
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
            const rest = await control.evaluate(measureControl)
            const restingColor = await control.evaluate((element) => getComputedStyle(element).color)
            expect(rest.fill, `${label} rest`).toBe('rgba(0, 0, 0, 0)')
            expect(rest.width, `${label} width`).toBeGreaterThanOrEqual(44)
            expect(rest.height, `${label} height`).toBeGreaterThanOrEqual(label === 'common.selectAll' || label === 'common.deselectAll' ? 42 : 44)
            await control.hover()
            if (!hasTouch) await expectFill(control, expectedFill, `${label} hover`)
            await page.mouse.down()
            await expectFill(control, expectedFill, `${label} press`)
            expect(await control.evaluate(measureControl), `${label} pressed geometry`).toEqual({ ...rest, fill: expectedFill })
            if (label === 'common.selectAll' || label === 'common.deselectAll') {
              const foreground = await control.evaluate((element) => getComputedStyle(element).color)
              const variables = resolveWebThemeVariables('orange', mode)
              expect(contrastOnSurface(foreground, [variables['--bg']!, variables['--bg-sheet']!, expectedFill])).toBeGreaterThanOrEqual(4.5)
            }
            await page.mouse.move(1, 1)
            await page.mouse.up()
            await expectFill(control, rest.fill, `${label} release`)
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
        const fill = await neutralFill(page)
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
          await control.hover()
          await page.mouse.down()
          expect(await control.evaluate(measureControl), `${label} disabled press`).toEqual(rest)
          await page.mouse.up()
          expect(await control.evaluate(measureControl), `${label} disabled release`).toEqual(rest)
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
          await control.hover()
          await page.mouse.down()
          expect(await control.evaluate(measureControl), `${label} read-only press`).toEqual(rest)
          await page.mouse.up()
        }
        const remove = page.getByRole('button', { name: 'habits.bulkBar.delete', exact: true })
        expect(await remove.isDisabled()).toBe(false)
        await remove.hover()
        await page.mouse.down()
        await expectFill(remove, await neutralFill(page), 'read-only delete press')
        await page.mouse.up()
        await page.mouse.move(1, 1)
        await expectFill(remove, 'rgba(0, 0, 0, 0)', 'read-only delete release')
      } finally { await page.close() }
    })
  }
})

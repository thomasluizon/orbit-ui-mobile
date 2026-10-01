import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { HabitTagChip } from '@/components/habits/habit-form-fields/habit-tag-chip'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [412, 1280].flatMap((width) => [false, true].map((selected) => ({ width, selected })))

describe('tag chip hover geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('fills only the hovered button at $width when selected is $selected', async ({ width, selected }) => {
    const view = render(<HabitTagChip tag={{ id: 'reading', name: 'Reading' }} selected={selected}
      disabled={false} atLimit={false} animationClassName="" editAriaLabel="Edit reading" deleteAriaLabel="Delete reading"
      onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="display:flex;padding:16px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const wrapper = page.locator('main > div')
      const restingWrapperFill = await wrapper.evaluate((element) => getComputedStyle(element).backgroundColor)
      const controls = page.getByRole('button')
      for (const control of await controls.all()) {
        await page.mouse.move(0, 0)
        await page.waitForTimeout(300)
        const restingFills = await controls.evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor))
        const bounds = (await control.boundingBox())!
        const wrapperBounds = (await wrapper.boundingBox())!
        expect(bounds.width).toBeGreaterThanOrEqual(44)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        expect(bounds.y).toBeGreaterThanOrEqual(wrapperBounds.y)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(wrapperBounds.y + wrapperBounds.height)
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 2)
        await page.waitForTimeout(300)
        expect(await wrapper.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restingWrapperFill)
        const painted = await control.evaluate((element) => {
          const style = getComputedStyle(element)
          const box = element.getBoundingClientRect()
          return { fill: style.backgroundColor, radius: parseFloat(style.borderRadius), overflow: style.overflow,
            ownsHit: element === document.elementFromPoint(box.x + box.width / 2, box.y + 2),
            clippedCorner: element !== document.elementFromPoint(box.x + 1, box.y + 1) }
        })
        expect(painted).toMatchObject({ overflow: 'hidden', ownsHit: true, clippedCorner: true })
        expect(painted.radius).toBeGreaterThanOrEqual(Math.min(bounds.width, bounds.height) / 2)
        const hoveredFills = await controls.evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor))
        const hoveredIndex = (await control.getAttribute('aria-label')) === 'Edit reading' ? 1 : (await control.getAttribute('aria-label')) === 'Delete reading' ? 2 : 0
        for (const [index, fill] of hoveredFills.entries()) {
          if (index === hoveredIndex) expect(fill).not.toBe(restingFills[index])
          else expect(fill).toBe(restingFills[index])
        }
      }
    } finally { await page.close() }
  })

  it.each([412, 1280])('leaves disabled tag actions unpainted at %s', async (width) => {
    const view = render(<HabitTagChip tag={{ id: 'reading', name: 'Reading' }} selected={false}
      disabled atLimit animationClassName="" editAriaLabel="Edit reading" deleteAriaLabel="Delete reading"
      onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      for (const control of await page.getByRole('button').all()) {
        expect(await control.isDisabled()).toBe(true)
        await page.mouse.move(0, 0)
        const restingFill = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
        const bounds = (await control.boundingBox())!
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        await page.waitForTimeout(300)
        expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(restingFill)
      }
    } finally { await page.close() }
  })
})

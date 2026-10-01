import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DateField } from '@/components/ui/date-field'
import { Sheet } from '@/components/ui/sheet'
import { buildYearRange } from '@orbit/shared/utils'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))
Element.prototype.scrollIntoView = vi.fn()

const BODY_INSETS_BY_WIDTH = new Map([
  [320, 4], [324, 8], [332, 12], [339, 12], [340, 16], [344, 16],
  [352, 16], [355, 16], [356, 24], [412, 24], [640, 24], [915, 24],
])

describe('DateField sheet geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([...BODY_INSETS_BY_WIDTH.keys()])('keeps all seven 44px columns inside the body at %ipx', async (width) => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 915 })
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      const measured = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const bounds = body.getBoundingClientRect()
        const style = getComputedStyle(body)
        return {
          left: bounds.left + parseFloat(style.paddingLeft),
          right: bounds.right - parseFloat(style.paddingRight),
          padding: parseFloat(style.paddingLeft),
          rightPadding: parseFloat(style.paddingRight),
          bottomPadding: parseFloat(style.paddingBottom),
          clientWidth: body.clientWidth,
          scrollWidth: body.scrollWidth,
          targets: [...document.querySelectorAll<HTMLButtonElement>('button[data-day]')].map((button) => {
            const target = button.getBoundingClientRect()
            const hit = document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2)
            return { left: target.left, right: target.right, width: target.width, height: target.height, reachable: button.contains(hit) }
          }),
        }
      })
      expect(measured.targets).toHaveLength(42)
      expect(measured.scrollWidth).toBe(measured.clientWidth)
      expect(measured.bottomPadding).toBe(24)
      expect([24, 16, 12, 8, 4]).toContain(measured.padding)
      expect(measured.padding).toBe(BODY_INSETS_BY_WIDTH.get(width))
      expect(measured.rightPadding).toBe(measured.padding)
      for (const target of measured.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
        expect(target.left).toBeGreaterThanOrEqual(measured.left - 0.01)
        expect(target.right).toBeLessThanOrEqual(measured.right + 0.01)
        expect(target.reachable).toBe(true)
      }
      if (width >= 356) expect(measured.padding).toBe(24)
    } finally { await page.close() }
  })


  it.each([320, 412])('has one year scroll owner in a %ipx tall viewport', async (height) => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 640, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      const years = buildYearRange(2025)
      const measured = await page.evaluate((years) => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const owners = [body, ...body.querySelectorAll<HTMLElement>('*')].filter((element) =>
          ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
        )
        const selected = [...body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent === '2025')!
        const scroller = selected.parentElement!.parentElement!
        const rect = scroller.getBoundingClientRect()
        const bodyRect = body.getBoundingClientRect()
        const targets = years.map((year) => {
          const button = [...body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent === String(year))!
          const bounds = button.getBoundingClientRect()
          return { width: bounds.width, height: bounds.height, top: bounds.top }
        })
        const reachable = [2025, years[0]!, years.at(-1)!].map((year) => {
          const button = [...body.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) => button.textContent === String(year))!
          button.scrollIntoView({ block: 'center', behavior: 'instant' })
          const bounds = button.getBoundingClientRect()
          const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
          return bounds.top >= rect.top && bounds.bottom <= rect.bottom && button.contains(hit)
        })
        return { owners: owners.length, contained: rect.top >= bodyRect.top && rect.bottom <= bodyRect.bottom, viewportHeight: rect.height, targets, reachable }
      }, years)
      expect(measured.owners).toBe(1)
      expect(measured.contained).toBe(true)
      expect(measured.viewportHeight).toBeGreaterThanOrEqual(44)
      expect(measured.targets).toHaveLength(years.length)
      expect(measured.targets[3]!.top - measured.targets[0]!.top).toBe(48)
      expect(measured.targets.every((target) => target.height === 44 && target.width >= 44)).toBe(true)
      expect(measured.reachable).toEqual([true, true, true])
    } finally { await page.close() }
  })

  it('keeps ordinary sheet content on the canonical 24px inset in a narrow window', async () => {
    render(<Sheet title="Title"><p>Short content</p></Sheet>)
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="sheet-body"]')!).paddingLeft)).toBe('24px')
    } finally { await page.close() }
  })
})

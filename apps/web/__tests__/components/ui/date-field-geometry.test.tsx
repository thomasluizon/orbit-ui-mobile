import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DateField } from '@/components/ui/date-field'
import { Sheet } from '@/components/ui/sheet'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))
Element.prototype.scrollIntoView = vi.fn()

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

  it.each([320, 340, 344, 352, 356, 412, 640, 915])('keeps all seven 44px columns inside the body at %ipx', async (width) => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const measured = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const bounds = body.getBoundingClientRect()
        const style = getComputedStyle(body)
        return {
          left: bounds.left + parseFloat(style.paddingLeft),
          right: bounds.right - parseFloat(style.paddingRight),
          padding: parseFloat(style.paddingLeft),
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

  it('keeps ordinary sheet content on the canonical 24px inset in a narrow window', async () => {
    render(<Sheet title="Title"><p>Short content</p></Sheet>)
    const dialog = await screen.findByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="sheet-body"]')!).paddingLeft)).toBe('24px')
    } finally { await page.close() }
  })
})

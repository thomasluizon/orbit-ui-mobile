import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({
    stats: { successfulReferrals: 1, pendingReferrals: 2, maxReferrals: 5, discountPercent: 20 },
    referralUrl: 'https://useorbit.org/r/ORBIT1',
    isLoading: false, isError: false, error: null,
  }),
}))

const widths = [320, 412, 640, 1440]

describe('Referral drawer sheet insets in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(widths)('aligns content and the pinned Share at %ipx, including copy failure', async (width) => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<ReferralDrawer open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'referral.drawer.copyLink' }))
    await screen.findByRole('alert')
    const dialog = screen.getByRole('dialog')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      const measured = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const text = (key: string) => [...body.querySelectorAll<HTMLElement>('*')].find((element) => element.textContent === key && element.children.length === 0)!
        const bounds = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        }
        const bodyBounds = body.getBoundingClientRect()
        const bodyStyle = getComputedStyle(body)
        const copy = body.querySelector('[aria-label="referral.drawer.copyLink"]')!
        const share = [...document.querySelectorAll('button')].find((button) => button.textContent === 'referral.drawer.share')!
        return {
          inset: parseFloat(bodyStyle.paddingLeft),
          edge: { left: bodyBounds.left + parseFloat(bodyStyle.paddingLeft), right: bodyBounds.right - parseFloat(bodyStyle.paddingRight) },
          link: bounds(copy.parentElement!),
          card: bounds(body.querySelector('[data-tone="quiet"]')!),
          disclaimer: bounds(text('referral.drawer.disclaimer')),
          error: bounds(body.querySelector('[role="alert"]')!),
          progress: bounds(body.querySelector('[role="progressbar"]')!),
          share: bounds(share),
          target: bounds(share.parentElement!),
          overflow: body.scrollWidth > body.clientWidth,
        }
      })
      expect(measured.inset).toBe(24)
      expect(measured.overflow).toBe(false)
      for (const surface of [measured.link, measured.card, measured.disclaimer, measured.error, measured.progress]) {
        expect(surface.left).toBeCloseTo(measured.edge.left, 1)
        expect(surface.right).toBeCloseTo(measured.edge.right, 1)
      }
      expect(measured.target.right).toBeCloseTo(measured.edge.right, 1)
      expect(measured.share.right).toBeCloseTo(measured.edge.right - 2, 1)
    } finally { await page.close() }
  })

  it('keeps the feature guide inside its sheet inset after removing the dead bleed rule', async () => {
    render(<FeatureGuideDrawer open onOpenChange={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      const measured = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const bounds = body.getBoundingClientRect()
        const child = body.firstElementChild!.getBoundingClientRect()
        return { left: child.left - bounds.left, right: bounds.right - child.right }
      })
      expect(measured).toEqual({ left: 24, right: 24 })
    } finally { await page.close() }
  })
})

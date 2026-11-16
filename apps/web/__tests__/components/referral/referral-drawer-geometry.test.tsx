import { settleAnimations } from '@/e2e/layout/settle-animations'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { readControlHitArea } from '@/test-support/control-hit-area'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
const loadedReferral = {
  stats: { successfulReferrals: 1, pendingReferrals: 2, maxReferrals: 5, rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 20 },
  referralUrl: 'https://useorbit.org/r/ORBIT1',
  isLoading: false, isError: false, error: null,
}
const referralState = vi.hoisted(() => ({ loading: false }))
vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => referralState.loading
    ? { stats: null, referralUrl: null, isLoading: true, isError: false, error: null }
    : loadedReferral,
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
  afterEach(() => { referralState.loading = false })

  async function measureLinkBlock(loading: boolean) {
    referralState.loading = loading
    render(<ReferralDrawer open onOpenChange={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      return await page.evaluate((isLoading) => {
        const block = isLoading
          ? document.querySelector('[data-slot="referral-skeleton"]')!.firstElementChild!
          : document.querySelector('[aria-label="referral.drawer.copyLink"]')!.parentElement!
        const panel = document.querySelector('.orbit-sheet-panel')!.getBoundingClientRect()
        const rect = block.getBoundingClientRect()
        return { top: rect.top - panel.top, height: rect.height, radius: getComputedStyle(block).borderTopLeftRadius }
      }, loading)
    } finally {
      await page.close()
      cleanup()
    }
  }

  it('holds the place of the loaded link well with a skeleton at the same top and height', async () => {
    const loaded = await measureLinkBlock(false)
    expect(loaded.height).toBe(56)
    expect(loaded.radius, 'the link well has the 12 px field radius, as its mobile twin').toBe('12px')
    const skeleton = await measureLinkBlock(true)
    expect(skeleton.height, 'the link skeleton is as tall as the link well').toBe(loaded.height)
    expect(skeleton.top, 'the link well does not move when the referral loads').toBe(loaded.top)
  })

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
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
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
        const share = [...document.querySelectorAll('[data-slot="sheet-actions"] button')].find(button => button.textContent === 'referral.drawer.share')!
        const shareBounds = share.getBoundingClientRect()
        const hits = [
          [shareBounds.left + 1, shareBounds.top + shareBounds.height / 2],
          [shareBounds.right - 1, shareBounds.top + shareBounds.height / 2],
          [shareBounds.left + shareBounds.width / 2, shareBounds.top + 1],
          [shareBounds.left + shareBounds.width / 2, shareBounds.bottom - 1],
        ].map(([x, y]) => share.contains(document.elementFromPoint(x!, y!)))
        return {
          inset: parseFloat(bodyStyle.paddingLeft),
          edge: { left: bodyBounds.left + parseFloat(bodyStyle.paddingLeft), right: bodyBounds.right - parseFloat(bodyStyle.paddingRight) },
          link: bounds(copy.parentElement!),
          card: bounds(body.querySelector('[data-tone="quiet"]')!),
          disclaimer: bounds(text('referral.reward.eligibility')),
          error: bounds(body.querySelector('[role="alert"]')!),
          progress: bounds(body.querySelector('[role="progressbar"]')!),
          share: bounds(share),
          shareHeight: shareBounds.height,
          hits,
          overflow: body.scrollWidth > body.clientWidth,
        }
      })
      expect(measured.inset).toBe(24)
      expect(measured.overflow).toBe(false)
      for (const surface of [measured.link, measured.card, measured.disclaimer, measured.error, measured.progress]) {
        expect(surface.left).toBeCloseTo(measured.edge.left, 1)
        expect(surface.right).toBeCloseTo(measured.edge.right, 1)
      }
      expect(measured.share.right).toBeCloseTo(measured.edge.right, 1)
      expect(measured.shareHeight).toBe(44)
      expect(measured.hits).toEqual([true, true, true, true])
      const hit = await page.getByRole('button', { name: 'referral.drawer.share', exact: true }).evaluate(readControlHitArea)
      expect(hit.width).toBeGreaterThanOrEqual(48)
      expect(hit.height).toBeGreaterThanOrEqual(48)
      expect(hit.checks).toEqual([true, true, true, true])
    } finally { await page.close() }
  })

  it('keeps the feature guide inside its sheet inset after removing the dead bleed rule', async () => {
    render(<FeatureGuideDrawer open onOpenChange={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
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

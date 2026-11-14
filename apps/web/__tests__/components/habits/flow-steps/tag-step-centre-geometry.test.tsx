import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resetTagStepState, tagStepState, TagStepHarness } from './tag-step-harness'

const HEIGHT = 915
const cases = ([320, 360, 384, 412] as const).flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale })))

describe('tag step block centring in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the block between the header and the primary action at $width px in $locale', async ({ width, locale }) => {
    resetTagStepState()
    tagStepState.locale = locale
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') || width >= Number(query.match(/min-width: (\d+)px/)?.[1]),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
    const view = render(<TagStepHarness onContinue={vi.fn()} />)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: HEIGHT } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body><div class="flex h-dvh flex-col">${view.container.innerHTML}</div></body></html>`)
      const geometry = await page.evaluate(() => {
        const free = document.querySelector('[data-question-flow] main')!.getBoundingClientRect()
        const block = document.querySelector('[data-question-flow] main > [role="presentation"]')!.getBoundingClientRect()
        return { free: { top: free.top, bottom: free.bottom }, block: { top: block.top, bottom: block.bottom } }
      })
      expect(geometry.free.bottom - geometry.free.top, JSON.stringify(geometry)).toBeGreaterThan(geometry.block.bottom - geometry.block.top)
      const freeCentre = (geometry.free.top + geometry.free.bottom) / 2
      const blockCentre = (geometry.block.top + geometry.block.bottom) / 2
      expect(Math.abs(blockCentre - freeCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})

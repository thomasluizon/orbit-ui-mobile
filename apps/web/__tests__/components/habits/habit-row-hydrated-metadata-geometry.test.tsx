import { assertHydratedMetadataRow, compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { bundleHabitRowMetadata } from '@/__tests__/support/habit-row-metadata-browser'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('habit row standard in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let metadataBundle: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    stylesheet = await compileHabitRowStylesheet()
    metadataBundle = bundleHabitRowMetadata()
  })
  afterAll(async () => { vi.unstubAllGlobals(); await closeChrome(browserLaunch) }, 30_000)

  it.concurrent.for((['light', 'dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) => [1, 2, 2.5].flatMap((scale) =>
    (['en', 'pt-BR'] as const).map((locale) => ({ mode, width, scale, locale }))))))(
    'flows hydrated type and maximum checklist tokens in $mode/$locale at $width/$scale', async ({ mode, width, scale, locale }) => {
      const page = await browser.newPage({ viewport: { width, height: 2600 }, reducedMotion: 'reduce' })
      try {
        const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;padding:16px;background:var(--bg)}</style><div id="root" data-locale="${locale}"></div>`)
        await loadAppFonts(page)
        await page.addScriptTag({ content: metadataBundle })
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 4)
        for (const selecting of [false, true, false]) {
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          const rows = page.getByTestId('habit-row')
          for (let index = 0; index < 4; index++) {
            await assertHydratedMetadataRow(rows.nth(index), { width, scale, locale, index, selecting })
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          await page.locator('#select-rows').click()
        }
      } finally { await page.close() }
    },
  )
})

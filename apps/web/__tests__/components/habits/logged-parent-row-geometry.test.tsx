import { compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { bundleHabitRowMetadata } from '@/__tests__/support/habit-row-metadata-browser'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('logged parent row metadata in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let metadataBundle: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    stylesheet = await compileHabitRowStylesheet()
    metadataBundle = bundleHabitRowMetadata()
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.concurrent.for([320, 360, 384, 412].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))(
    'keeps the next due token whole and in the metadata flow at $width px in $locale', async ({ width, locale }) => {
      const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
      try {
        const tokens = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:16px}body{margin:0;background:var(--bg)}</style><main><div class="px-4"><div id="root" data-scenario="logged-parent" data-locale="${locale}"></div></div></main>`)
        await loadAppFonts(page)
        await page.addScriptTag({ content: metadataBundle })
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 4)
        await page.evaluate(async () => {
          await document.fonts.ready
          await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
        })
        const label = (locale === 'en' ? en : ptBR).habits.schedule.nextDueTomorrow
        for (const depth of [0, 1]) {
          const measure = (id: string) => page.locator(`[data-habit-id="${id}"]`).evaluate((element) => {
            const card = element.getBoundingClientRect()
            const tokens = [...element.querySelectorAll<HTMLElement>('[data-habit-row-meta] [data-habit-row-meta-token]')]
            return {
              supporting: element.querySelector('[data-habit-row-heading]') !== null,
              lines: new Set(tokens.map((token) => Math.round(token.getBoundingClientRect().top))).size,
              tokens: tokens.map((token) => {
                const box = token.getBoundingClientRect()
                const text = token.firstElementChild instanceof HTMLElement ? token.firstElementChild : token
                return { text: token.textContent!.replace(/·$/, ''), clipped: text.scrollWidth > text.clientWidth || box.left < card.left || box.right > card.right }
              }),
            }
          })
          const open = await measure(`open-${depth}`)
          const logged = await measure(`logged-${depth}`)
          const context = JSON.stringify({ width, locale, depth, open, logged })
          expect(logged.tokens.at(-1)?.text, context).toBe(label)
          expect(logged.tokens.filter((token) => token.clipped), context).toEqual([])
          /** A nested parent at 320 px is already on the supporting line, which holds two tokens; the whole label then starts the next line. */
          const footerFull = width === 320 && depth === 1
          expect({ lines: logged.lines, supporting: logged.supporting || !open.supporting }, context)
            .toEqual({ lines: footerFull ? 2 : 1, supporting: true })
        }
      } finally { await page.close() }
    },
  )
})

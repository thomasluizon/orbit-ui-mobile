import { assertHydratedMetadataRow, compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { bundleHabitRowMetadata } from '@/__tests__/support/habit-row-metadata-browser'
import { setHabitTextScale } from '@/e2e/layout/subhabit-indent-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
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

  it.each((['light', 'dark'] as const).flatMap((mode) => (['en', 'pt-BR'] as const).map((locale) => ({ mode, locale }))))(
    'wraps live not-due status within the narrow detail row in $mode/$locale', async ({ mode, locale }) => {
      const page = await browser.newPage({ viewport: { width: 320, height: 915 }, reducedMotion: 'reduce' })
      try {
        const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:16px}body{margin:0;background:var(--bg)}</style><main class="overflow-y-auto [scrollbar-gutter:stable]" style="height:915px"><div class="px-4"><div id="root" data-scenario="not-due" data-locale="${locale}"></div></div></main>`)
        await loadAppFonts(page)
        await page.addScriptTag({ content: metadataBundle })
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 3)
        for (const scale of [1, 2, 2.5, 1]) {
          await page.evaluate(async (scale) => {
            document.documentElement.style.fontSize = `${16 * scale}px`
            window.dispatchEvent(new Event('resize'))
            await document.fonts.ready
            await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
          }, scale)
          if (scale > 1.3) await page.waitForFunction(() => document.querySelectorAll('[data-habit-row-heading]').length === 3)
          for (const [id, label] of [['child-1', (locale === 'en' ? en : ptBR).habits.statusDot.skip], ['child-3', (locale === 'en' ? en : ptBR).calendar.dayCell.notScheduled]]) {
            const row = page.locator(`[data-habit-id="${id}"]`)
            expect(await row.locator('[data-habit-row-meta]').textContent()).toContain(label)
            const measured = await row.evaluate((element) => {
              const card = element.getBoundingClientRect()
              return [...element.querySelectorAll('[data-habit-row-meta-token]')].map((token) => {
                const box = token.getBoundingClientRect()
                const range = document.createRange()
                range.selectNodeContents(token)
                const text = range.getBoundingClientRect()
                const style = getComputedStyle(token)
                const strip = token.parentElement!
                return { clearance: { left: box.left - card.left, right: card.right - box.right, bottom: card.bottom - box.bottom,
                  textLeft: text.left - box.left, textRight: box.right - text.right, textBottom: box.bottom - text.bottom },
                  token: token.outerHTML, width: box.width, stripWidth: strip.getBoundingClientRect().width,
                  whiteSpace: style.whiteSpace, maxWidth: style.maxWidth, minWidth: style.minWidth, shrink: style.flexShrink }
              })
            })
            for (const token of measured) {
              expect(Math.min(...Object.values(token.clearance)), JSON.stringify({ scale, id, token })).toBeGreaterThanOrEqual(0)
            }
          }
          expect(await page.locator('[data-habit-id="child-2"] [data-habit-check]').getAttribute('data-status')).toBe('done')
        }
      } finally { await page.close() }
    },
  )

  it.each((['light', 'dark'] as const).flatMap((mode) =>
    (['en', 'pt-BR'] as const).map((locale) => ({ mode, locale })),
  ))('changes supporting layout without animating structural geometry in $mode/$locale with reduced motion', async ({ mode, locale }) => {
    const page = await browser.newPage({ viewport: { width: 412, height: 2600 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:16px}body{margin:0;padding:16px;background:var(--bg)}</style><div id="root" data-locale="${locale}"></div>`)
      await loadAppFonts(page)
      await page.addScriptTag({ content: metadataBundle })
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 4)
      await page.locator('#select-rows').click()
      const receipt = await page.evaluateHandle(() => {
        const transitions: { property: string; target: string; pending: boolean }[] = []
        const record = () => {
          for (const animation of document.getAnimations()) {
            if (!(animation instanceof CSSTransition) || !['flex-grow', 'flex-shrink', 'padding-top'].includes(animation.transitionProperty)) continue
            const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
            transitions.push({ property: animation.transitionProperty, target: target?.outerHTML.slice(0, 200) ?? '', pending: animation.pending })
          }
        }
        const observer = new MutationObserver(record)
        observer.observe(document.querySelector('#root')!, { subtree: true, attributes: true, childList: true })
        return { transitions, observer }
      })
      try {
        for (const selecting of [true, false]) {
          if (!selecting) await page.locator('#select-rows').click()
          for (const scale of [2, 1, 2, 1]) {
            await setHabitTextScale(page, scale)
            expect(await page.locator('[data-habit-row-heading]').count()).toBe(scale === 2 ? 4 : 0)
            expect(await page.locator('[data-habit-row-control="selection"]').count()).toBe(selecting ? 4 : 0)
          }
        }
        const trace = await receipt.evaluate(({ transitions }) => transitions)
        expect(trace).toEqual([])
      } finally {
        await receipt.evaluate(({ observer }) => observer.disconnect())
        await receipt.dispose()
      }
    } finally { await page.close() }
  })

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

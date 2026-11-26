import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator } from 'next-intl'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginLegalConsent } from '@/app/(auth)/login/email-step'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const FOCUS_RING_REACH = 4

describe('the legal consent line keeps room for the focus fill of each link', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: 'Geist'; src: url(data:font/ttf;base64,${font}); } :root { --font-geist: 'Geist'; }`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['en', 'pt-BR'] as const)('gives each link an inline margin that does not depend on the font in %s', async (locale) => {
    const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    const markup = renderToStaticMarkup(<LoginLegalConsent t={t} />)
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } })
    try {
      await page.setContent(`<html><style>${stylesheet}</style>${markup}</html>`)
      const margins = await page.getByRole('link').evaluateAll((links) => links.map((link) => {
        const style = getComputedStyle(link)
        return { left: Number.parseFloat(style.marginLeft), right: Number.parseFloat(style.marginRight) }
      }))
      expect(margins).toHaveLength(2)
      const [first, second] = margins
      expect(first!.right + second!.left).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE - FOCUS_RING_REACH)
      expect(first!.left).toBeGreaterThanOrEqual((INTERACTION_FILL_CLEARANCE - FOCUS_RING_REACH) / 2)
      expect(second!.right).toBeGreaterThanOrEqual((INTERACTION_FILL_CLEARANCE - FOCUS_RING_REACH) / 2)
    } finally { await page.close() }
  })

  it.each([320, 412].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('keeps the focus fill of each link clear of the other link on the next line at $width in $locale', async ({ width, locale }) => {
    const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    const markup = renderToStaticMarkup(<LoginLegalConsent t={t} />)
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage({ viewport: { width, height: 600 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<html style="${variables}"><style>${stylesheet}</style><body style="width:${width - 64}px;margin:32px">${markup}</body></html>`)
      await page.evaluate(() => document.fonts.ready)
      const links = await page.getByRole('link').all()
      expect(links).toHaveLength(2)
      await page.keyboard.press('Tab')
      for (const [index, link] of links.entries()) {
        await link.focus()
        const { fill, hasFill } = await link.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
        expect(hasFill).toBe(true)
        const lineGaps = await links[1 - index]!.evaluate((other, box) => [...other.getClientRects()].flatMap((rect) => {
          if (rect.top >= box.bottom) return [rect.top - box.bottom]
          if (rect.bottom <= box.top) return [box.top - rect.bottom]
          return []
        }), fill)
        for (const gap of lineGaps) expect(gap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      }
    } finally { await page.close() }
  })
})

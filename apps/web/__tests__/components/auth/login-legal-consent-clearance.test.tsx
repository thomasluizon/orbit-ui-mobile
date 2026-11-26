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
})

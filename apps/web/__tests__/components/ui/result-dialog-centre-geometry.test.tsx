import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ResultDialog } from '@/components/ui/result-dialog'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, FLOW_WIDTHS, compileAppStylesheet, stubViewportMedia } from '@/__tests__/support/flow-layout'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'

const HEIGHT = 780
type Translate = (key: string, values?: Record<string, string>) => string
/** One dialog of each kind: a create with two actions, a destructive result with one action, and the longest sentence. */
const dialogs: Record<string, (t: Translate) => { sentence: string; primary: string; secondary?: string; orbitState: 'feliz' | 'parado' }> = {
  'created task': (t) => ({ sentence: t('result.task.datedTimed', { date: '14/11', time: '08:00' }), primary: t('result.seeToday'), secondary: t('result.createAnother'), orbitState: 'feliz' }),
  'sent support request': (t) => ({ sentence: t('result.support.sent', { email: 'ada@example.com' }), primary: t('profile.support.backToAbout'), orbitState: 'feliz' }),
  'fresh start': (t) => ({ sentence: t('result.account.freshStart'), primary: t('result.account.openToday'), orbitState: 'parado' }),
  'scheduled account deletion': (t) => ({ sentence: t('result.account.deletionScheduledPro', { date: '21/11/2026' }), primary: t('stepUp.signOut'), orbitState: 'parado' }),
}
const cases = FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => Object.keys(dialogs).map((dialog) => ({ width, locale, dialog }))))

describe('result dialog centring in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('centres the $dialog panel in the viewport at $width px in $locale, with each action on one line', async ({ width, locale, dialog }) => {
    stubViewportMedia(width)
    const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR }) as unknown as Translate
    const content = dialogs[dialog]!(t)
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
      <ResultDialog title={t('result.title')} sentence={content.sentence} primaryLabel={content.primary} onPrimary={vi.fn()}
        secondaryLabel={content.secondary} onSecondary={content.secondary ? vi.fn() : undefined} onClose={vi.fn()} orbitState={content.orbitState} />
    </NextIntlClientProvider>)
    await screen.findByRole('dialog')
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: HEIGHT } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
        /** Only text boxes count, and a box starts a new line only when its top is more than half a line under the last one. */
        const lineCount = (element: Element) => {
          const tops: number[] = []
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top)
          }
          tops.sort((first, second) => first - second)
          return tops.filter((top, index) => index === 0 || top - tops[index - 1]! > 8).length
        }
        const actions = [...document.querySelectorAll('[role="dialog"] button')].filter((button) => button.textContent.trim())
          .map((button) => ({ label: button.textContent.trim(), lines: lineCount(button) }))
        return { top: panel.top, bottom: panel.bottom, left: panel.left, right: panel.right, actions, state: document.querySelector('[data-result-dialog]')?.getAttribute('data-orbit-state'), viewport: { width: window.innerWidth, height: window.innerHeight } }
      })
      expect(Math.abs((geometry.top + geometry.bottom) / 2 - geometry.viewport.height / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.left + geometry.right) / 2 - geometry.viewport.width / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(geometry.top).toBeGreaterThanOrEqual(0)
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport.height)
      expect(geometry.state).toBe(content.orbitState)
      expect(geometry.actions.map((action) => action.label)).toEqual(content.secondary ? [content.primary, content.secondary] : [content.primary])
      for (const action of geometry.actions) expect(action.lines, action.label).toBe(1)
    } finally { await page.close(); view.unmount() }
  }, 60_000)
})

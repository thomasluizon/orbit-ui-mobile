import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { astraOfferFixture } from '@orbit/shared/test-support/astra-offer-fixtures'
import { AstraOffer } from '@/components/chat/astra-offer'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-astra-offer', () => ({ useAstraOffer: () => ({ visible: true, pending: false, failed: false, disabled: false, dismissDisabled: false, act: vi.fn(), dismiss: vi.fn() }) }))
vi.mock('@/components/referral/referral-drawer', () => ({ ReferralDrawer: () => null }))

const cases = [320, 360, 384, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => (['openSurface', 'continueChat'] as const).flatMap(kind => (['light', 'dark'] as const).map(theme => ({ width, locale, kind, theme })))))

describe('offer slot production geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps a whole label and one focus indicator at $width in $locale $theme for $kind', async ({ width, locale, kind, theme }) => {
    const messages = locale === 'en' ? en : ptBR
    const label = kind === 'openSurface' ? locale === 'en' ? 'Review Astra settings' : 'Ver configurações da Astra'
      : locale === 'en' ? 'Use with a habit' : 'Usar em um hábito'
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <div style={{ padding: 32 }}><AstraOffer action={{ ...astraOfferFixture, kind, label }} /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${theme}" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-astra-offer]').evaluate(slot => ({
        slotFits: slot.scrollWidth <= slot.clientWidth + 1,
        actions: [...slot.querySelectorAll('button')].map(button => {
          const label = button.querySelector('span')
          const range = document.createRange()
          if (label) range.selectNodeContents(label)
          const text = label ? range.getBoundingClientRect() : null
          const bounds = button.getBoundingClientRect()
          const hitArea = getComputedStyle(button, '::after')
          const hitInset = Math.max(0, -parseFloat(hitArea.right))
          return { name: button.getAttribute('aria-label'), width: button.clientWidth, scrollWidth: button.scrollWidth, hitInset, targetHeight: bounds.height - parseFloat(hitArea.top) - parseFloat(hitArea.bottom), fits: button.scrollWidth <= button.clientWidth + hitInset + 1,
            lines: label ? range.getClientRects().length : 0, containsText: !text || text.left >= bounds.left && text.right <= bounds.right }
        }),
      }))
      expect(geometry.slotFits).toBe(true)
      expect(geometry.actions[0], JSON.stringify(geometry)).toMatchObject({ name: label, fits: true, lines: 1, containsText: true })
      expect(geometry.actions[0]!.targetHeight).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN)
      for (const name of [label, messages.chat.offers.dismiss]) {
        await page.keyboard.press('Tab')
        const focus = await page.getByRole('button', { name }).evaluate(button => {
          const style = getComputedStyle(button)
          const shadows = style.boxShadow.split(/,(?![^()]*\))/).filter(shadow => shadow !== 'none' && !/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(shadow)).length
          const nested = [...button.querySelectorAll('*')].filter(child => getComputedStyle(child).outlineStyle !== 'none' && parseFloat(getComputedStyle(child).outlineWidth) > 0).length
          return { focused: document.activeElement === button, outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0, shadows, nested }
        })
        expect(focus).toMatchObject({ focused: true, outline: true, shadows: 0, nested: 0 })
      }
    } finally { await page.close() }
  })
})

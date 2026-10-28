import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { makeOneSmallStepCard } from '@orbit/shared/test-support/chat-fixtures'
import { BUTTON_SIZES, typeRoles } from '@orbit/shared/theme'
import { OneSmallStepCard } from '@/components/chat/one-small-step-card'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 360, 384, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => ['light', 'dark'].flatMap(theme => [1, 2].map(textScale => ({ width, locale, theme, textScale })))))

describe('one small step production geometry', () => {
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

  it.each(cases)('keeps full labels and bounded text at $width in $locale $theme at text scale $textScale', async ({ width, locale, theme, textScale }) => {
    const card = makeOneSmallStepCard(locale)
    card.suggestion.goal = Array.from({ length: 10 }, () => card.suggestion.goal).join(' ')
    card.suggestion.step = Array.from({ length: 10 }, () => card.suggestion.step).join(' ').slice(0, 200)
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}>
      <div style={{ maxWidth: 708, padding: 16 }}><OneSmallStepCard card={card} onSendMessage={vi.fn()} /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet} html { font-size: ${16 * textScale}px; }</style><div class="${theme}">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-conversation-block]').evaluate(frame => {
        const bounds = frame.getBoundingClientRect()
        const actions = [...frame.querySelectorAll('[data-slot="action-row"] button')].map(button => {
          const label = button.querySelector('span')!
          const range = document.createRange()
          range.selectNodeContents(label)
          const labelBounds = range.getBoundingClientRect()
          const buttonBounds = button.getBoundingClientRect()
          return { label: button.getAttribute('aria-label'), lines: range.getClientRects().length,
            width: label.clientWidth, scrollWidth: label.scrollWidth, fontSize: parseFloat(getComputedStyle(label).fontSize),
            labelBounds: { left: labelBounds.left, right: labelBounds.right, top: labelBounds.top, bottom: labelBounds.bottom },
            left: buttonBounds.left, right: buttonBounds.right, top: buttonBounds.top, bottom: buttonBounds.bottom, height: buttonBounds.height }
        })
        const texts = [...frame.querySelectorAll('[data-personal-text]')].map(text => {
          const style = getComputedStyle(text)
          return { width: text.getBoundingClientRect().width, height: text.getBoundingClientRect().height,
            lineHeight: parseFloat(style.lineHeight), fontSize: parseFloat(style.fontSize),
            letterSpacing: parseFloat(style.letterSpacing), fontWeight: style.fontWeight, clamp: style.webkitLineClamp }
        })
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, actions, texts, pageWidth: document.documentElement.scrollWidth }
      })
      expect(geometry.pageWidth).toBeLessThanOrEqual(width)
      expect(geometry.actions.map(action => action.label)).toEqual(card.actions.map(action => action.label))
      for (const action of geometry.actions) {
        if (textScale === 1) expect(action.lines).toBe(1)
        expect(action.fontSize).toBe(BUTTON_SIZES.sm.fontSize * textScale)
        expect(action.scrollWidth).toBeLessThanOrEqual(action.width)
        expect(action.labelBounds.left).toBeGreaterThanOrEqual(action.left)
        expect(action.labelBounds.right).toBeLessThanOrEqual(action.right)
        expect(action.labelBounds.top).toBeGreaterThanOrEqual(action.top)
        expect(action.labelBounds.bottom).toBeLessThanOrEqual(action.bottom)
        expect(action.left).toBeGreaterThanOrEqual(geometry.left)
        expect(action.right).toBeLessThanOrEqual(geometry.right)
        expect(action.top).toBeGreaterThanOrEqual(geometry.top)
        expect(action.bottom).toBeLessThanOrEqual(geometry.bottom)
        if (textScale === 1) expect(action.height).toBe(geometry.actions[0]!.height)
      }
      expect(geometry.texts).toHaveLength(2)
      for (const text of geometry.texts) {
        expect(text.width).toBeLessThanOrEqual(geometry.width)
        expect(text.height).toBeLessThanOrEqual(text.lineHeight * 2 + 1)
        expect(text.clamp).toBe('2')
      }
      expect(geometry.texts[1]).toMatchObject({
        fontSize: typeRoles.h2.size,
        lineHeight: typeRoles.h2.size * typeRoles.h2.lineHeight,
        letterSpacing: typeRoles.h2.size * typeRoles.h2.letterSpacingEm,
        fontWeight: String(typeRoles.h2.weight),
      })
    } finally { await page.close() }
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitMonthDaysField } from '@/components/habits/habit-form-fields/habit-month-days-field'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 360].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale })))

function message(messages: typeof en, key: string, values?: Record<string, string | number>): string {
  const template = key.split('.').reduce<unknown>((current, part) => Reflect.get(current as object, part), messages)
  return String(new IntlMessageFormat(template as string, messages === ptBR ? 'pt-BR' : 'en').format(values))
}

function newStrings(messages: typeof en): string[] {
  const days = message(messages, 'listFormatting.pair', { first: [1, 8].map(day => message(messages, 'habits.frequency.monthDay', { day })).join(', '), last: message(messages, 'habits.frequency.monthDay', { day: 15 }) })
  return [
    message(messages, 'habits.frequency.onMonthDays', { days }),
    message(messages, 'habits.frequency.everyNMonthsOnDays', { days, n: 2, count: 3 }),
    message(messages, 'habits.form.understoodMonthDaysAt', { schedule: message(messages, 'habits.frequency.onMonthDays', { days }), time: '09:00' }),
    message(messages, 'habits.form.monthDaysQuestion'),
    message(messages, 'habits.form.monthDaysShortMonth'),
    message(messages, 'habits.form.monthDaysInvalid'),
    message(messages, 'habits.form.monthDaysOnlyForMonthly'),
    message(messages, 'chat.operation.field.month_days'),
  ]
}

describe('month-day question geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${variables}}`
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('keeps the question, summary, hint and 31 days inside $width px in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const view = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <HabitMonthDaysField visible monthDays={[1, 8, 15, 31]} anchorDay={8} quantity={1} onToggle={() => {}} />
    </NextIntlClientProvider>)
    const field = view.container.querySelector('[data-habit-month-days]')!
    const lines = newStrings(messages).map(text => `<p data-new-string class="text-sm">${text}</p>`).join('')
    const page = await browser.newPage({ viewport: { width, height: 1400 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="padding:16px"><section style="padding-inline:16px">${field.outerHTML}${lines}</section></main>`)
      await loadAppFonts(page)
      const lineCounts = await page.locator('[data-habit-month-days] > span, [data-habit-month-days] > p, [data-new-string]').evaluateAll(elements => elements.map(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return { text: element.textContent, lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size }
      }))
      expect(lineCounts.length).toBeGreaterThanOrEqual(11)
      lineCounts.forEach(line => expect(line, line.text).toMatchObject({ lines: 1 }))
      const days = await page.locator('fieldset button').evaluateAll(buttons => buttons.map(button => {
        const box = button.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(button)
        const text = range.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, width: box.width, height: box.height, textLeft: text.left, textRight: text.right }
      }))
      expect(days).toHaveLength(31)
      days.forEach((box, index) => {
        expect(box.width).toBeGreaterThanOrEqual(24)
        expect(box.height).toBeGreaterThanOrEqual(48)
        expect(box.textLeft).toBeGreaterThanOrEqual(box.left - 0.1)
        expect(box.textRight).toBeLessThanOrEqual(box.right + 0.1)
        if (index % 7) expect(box.left).toBeGreaterThanOrEqual(days[index - 1]!.right)
      })
      expect(new Set(days.map(box => box.top)).size).toBe(5)
      expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    } finally { await page.close() }
  })
})

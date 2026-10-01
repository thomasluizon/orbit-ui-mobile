import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildHabitUnderstandingLabels, buildHabitUnderstandingSentence, readHabitPhrase } from '@orbit/shared/utils'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  ['fixed', 'flexible', 'unresolved', 'proposed'].map((cadence) => ({ width, locale, cadence })),
))

describe('habit understanding geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('fits $cadence corrections in $locale at $width', async ({ width, locale, cadence }) => {
    const messages = locale === 'en' ? en : ptBR
    const translate = createTranslator({ locale, messages }) as (key: string, values?: Record<string, string | number>) => string
    const phrases = locale === 'en'
      ? { fixed: 'Read every Monday and Thursday at 08:00', flexible: 'Run 3 times a week', unresolved: 'Read', proposed: 'Read every Monday and Thursday at 08:00' }
      : { fixed: 'Ler toda segunda e quinta às 08:00', flexible: 'Correr 3 vezes por semana', unresolved: 'Ler', proposed: 'Ler toda segunda e quinta às 08:00' }
    const value = phrases[cadence as keyof typeof phrases]
    const parsed = readHabitPhrase(value, locale)
    const dayOptions = Object.entries(messages.dates.daysShort).map(([day, label]) => ({
      value: day.charAt(0).toUpperCase() + day.slice(1), label,
      accessibleLabel: messages.dates.daysLong[day as keyof typeof messages.dates.daysLong],
    }))
    const flexible = parsed.cadence === 'flexible'
    const sentence = buildHabitUnderstandingSentence(parsed.days, dayOptions, flexible,
      parsed.cadence === 'fixed' ? 'Day' : flexible ? 'Week' : null, parsed.frequencyQuantity ?? 1,
      parsed.dueTime ?? '', locale, translate)
    const view = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><HabitUnderstanding value={value} emoji="" days={parsed.days} dayOptions={dayOptions}
      proposed={cadence === 'proposed'} quantity={parsed.frequencyQuantity ?? 3} mode={flexible ? 'flexible' : 'fixed'} sentence={sentence}
      consumed={parsed.consumed} labels={buildHabitUnderstandingLabels(translate)}
      onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="width:${Math.min(width - 32, 560)}px;margin:16px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const measured = await page.evaluate(() => {
        const main = document.querySelector('main')!
        const fieldset = main.querySelector('fieldset')!
        const dayTargets = [...fieldset.querySelectorAll('button')].map((button) => {
          const bounds = button.getBoundingClientRect()
          const parent = fieldset.getBoundingClientRect()
          return { width: bounds.width, height: bounds.height, top: bounds.top, contained: bounds.left >= parent.left && bounds.right <= parent.right }
        })
        const emoji = main.querySelector('button[aria-haspopup="dialog"]')!
        return { overflowing: main.scrollWidth > main.clientWidth, dayTargets, radius: getComputedStyle(emoji).borderRadius,
          radioGroups: main.querySelectorAll('[role="radiogroup"]').length, buttonCount: main.querySelectorAll('button').length }
      })
      expect(measured.overflowing).toBe(false)
      expect(measured.radioGroups).toBe(0)
      expect(measured.radius).toBe('12px')
      expect(measured.buttonCount).toBe(['fixed', 'proposed'].includes(cadence) ? 8 : 10)
      expect(new Set(measured.dayTargets.map((target) => target.top)).size).toBe(1)
      for (const target of measured.dayTargets) {
        expect(target).toMatchObject({ width: 44, height: 44, contained: true })
      }
    } finally { await page.close() }
  })
})

import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { render } from '@testing-library/react'
import { expect, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildHabitUnderstandingLabels, buildHabitUnderstandingSentence, readHabitPhrase } from '@orbit/shared/utils'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { type Browser } from '@/__tests__/support/chromium'

const expectedButtonCounts: Readonly<Record<string, number>> = { daily: 8, fixed: 8, flexible: 10, unresolved: 9, proposed: 8, locked: 10 }

const defaultCases = [320, 360, 393, 412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  ['daily', 'fixed', 'flexible', 'unresolved', 'proposed', 'locked'].map((cadence) => ({ width, locale, cadence, scale: 1 })),
))

export const cases = [...defaultCases, ...[320, 360, 393, 412].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale, cadence: 'daily', scale: 2 })))]

type GeometryCase = typeof cases[number]

export async function compileHabitUnderstandingGeometry() {
  const source = resolve(process.cwd(), 'app/globals.css')
  const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
  return (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
}

export async function expectHabitUnderstandingGeometry(browser: Browser, stylesheet: string, { width, locale, cadence, scale }: GeometryCase) {
  const messages = locale === 'en' ? en : ptBR
  const translate = createTranslator({ locale, messages }) as (key: string, values?: Record<string, string | number>) => string
  const phrases = locale === 'en'
    ? { daily: 'Read every day', fixed: 'Read every Monday and Thursday at 08:00', flexible: 'Run 3 times a week', unresolved: 'Read', proposed: 'Read every Monday and Thursday at 08:00' }
    : { daily: 'Ler todo dia', fixed: 'Ler toda segunda e quinta às 08:00', flexible: 'Correr 3 vezes por semana', unresolved: 'Ler', proposed: 'Ler toda segunda e quinta às 08:00' }
  const value = phrases[(cadence === 'locked' ? 'flexible' : cadence) as keyof typeof phrases]
  const parsed = readHabitPhrase(value, locale)
  const dayOptions = Object.entries(messages.dates.daysShort).map(([day, label]) => ({
    value: day.charAt(0).toUpperCase() + day.slice(1), label,
    accessibleLabel: messages.dates.daysLong[day as keyof typeof messages.dates.daysLong],
  }))
  const flexible = parsed.cadence === 'flexible'
  const sentence = buildHabitUnderstandingSentence(parsed.days, dayOptions, flexible,
    (parsed.cadence === 'fixed' || parsed.cadence === 'daily') ? 'Day' : flexible ? 'Week' : null, parsed.frequencyQuantity ?? 1,
    parsed.dueTime ?? '', locale, translate)
  const view = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><HabitUnderstanding value={value} emoji="" days={parsed.days} dayOptions={dayOptions}
    proposed={cadence === 'proposed'} scheduleLocked={cadence === 'locked'} quantity={parsed.frequencyQuantity ?? 3} mode={flexible ? 'flexible' : 'fixed'} sentence={sentence}
    consumed={parsed.consumed} labels={buildHabitUnderstandingLabels(translate)}
    onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} /></NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width, height: 1000 } })
  try {
    await page.setContent(`<style>${stylesheet}:root{font-size:${16 * scale}px}</style><main style="width:${Math.min(width - 32, 560)}px;margin:16px">${view.container.innerHTML}</main>`)
    await loadAppFonts(page)
    const measured = await page.evaluate(() => {
      const main = document.querySelector('main')!
      const fieldset = main.querySelector('fieldset')!
      const dayTargets = [...fieldset.querySelectorAll('button')].map((button) => {
        const bounds = button.getBoundingClientRect()
        const parent = fieldset.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height, top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, contained: bounds.left >= parent.left && bounds.right <= parent.right }
      })
      const emoji = main.querySelector('button[aria-haspopup="dialog"]')
      return { wrap: getComputedStyle(fieldset).flexWrap, overflowing: main.scrollWidth > main.clientWidth, dayTargets, radius: emoji ? getComputedStyle(emoji).borderRadius : null,
        radioGroups: main.querySelectorAll('[role="radiogroup"]').length, buttonCount: main.querySelectorAll('button').length }
    })
    expect(measured.wrap).toBe('nowrap')
    expect(measured.overflowing).toBe(false)
    expect(measured.radioGroups).toBe(0)
    expect(measured.radius).toBe(cadence === 'unresolved' ? null : '12px')
    expect(measured.buttonCount).toBe(expectedButtonCounts[cadence])
    for (let index = 1; index < measured.dayTargets.length; index++) {
      const previous = measured.dayTargets[index - 1]!
      const target = measured.dayTargets[index]!
      expect(target.top).toBe(measured.dayTargets[0]!.top)
      expect(target.left).toBeGreaterThanOrEqual(previous.right)
    }
    for (const target of measured.dayTargets) {
      expect(target.contained).toBe(true)
      expect(target.width).toBeGreaterThanOrEqual(24)
      expect(target.height).toBeGreaterThanOrEqual(48)
      expect(target.width).toBeCloseTo(measured.dayTargets[0]!.width, 1)
    }
    for (const control of await page.locator('main button:not([aria-haspopup])').all()) {
      expect(await control.isDisabled()).toBe(cadence === 'locked')
      await page.mouse.move(0, 0)
      const resting = await control.evaluate((element) => {
        const style = getComputedStyle(element.querySelector('span[data-selected], span.orbit-selection-ring') ?? element)
        return { fill: style.backgroundColor, color: style.color }
      })
      const bounds = (await control.boundingBox())!
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await control.evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished))
      })
      const hovered = await control.evaluate((element) => {
        const style = getComputedStyle(element.querySelector('span[data-selected], span.orbit-selection-ring') ?? element)
        return { fill: style.backgroundColor, color: style.color }
      })
      if (cadence === 'locked') expect(hovered).toEqual(resting)
      else expect(hovered.fill).not.toBe(resting.fill)
    }
  } finally { await page.close() }
}

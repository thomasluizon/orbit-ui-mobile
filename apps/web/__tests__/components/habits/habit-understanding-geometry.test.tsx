import { resolveWebThemeVariables } from '@/lib/theme-dom'
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
import { Input } from '@/components/ui/input'
import { TypedTextarea } from '@/components/ui/typed-textarea'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const expectedButtonCounts: Readonly<Record<string, number>> = { fixed: 8, flexible: 10, unresolved: 9, proposed: 8, locked: 10 }

const cases = [320, 360, 412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  ['fixed', 'flexible', 'unresolved', 'proposed', 'locked'].map((cadence) => ({ width, locale, cadence })),
))

describe('habit understanding geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)


  it.each(['light', 'dark'] as const)('paints typed habit text with the foreground token in %s', async (mode) => {
    const value = 'Run Monday'
    const parsed = readHabitPhrase(value, 'en')
    const view = render(<><Input label="Single line" value={value} onChange={vi.fn()} /><Input label="Multiline" value={value} onChange={vi.fn()} multiline /><TypedTextarea aria-label="Primitive" value={value} onChange={vi.fn()} style={{ color: 'transparent' }} /><HabitUnderstanding value={value} emoji="" days={parsed.days} dayOptions={[]}
      quantity={1} mode="fixed" sentence={null} consumed={parsed.consumed} labels={buildHabitUnderstandingLabels((key) => key)}
      onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} /></>)
    const page = await browser.newPage({ viewport: { width: 412, height: 800 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, token]) => `${key}:${token}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${theme}}</style><main>${view.container.innerHTML}</main>`)
      await page.locator('#habit-phrase').focus()
      const paints = await page.locator('input, textarea').evaluateAll((controls) => controls.map((element) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement
        const expected = document.createElement('span')
        expected.style.color = 'var(--fg-1)'
        document.body.append(expected)
        const foreground = getComputedStyle(expected).color
        expected.remove()
        const style = getComputedStyle(control)
        return { foreground, color: style.color, fill: style.webkitTextFillColor, value: control.value }
      }))
      expect(paints).toHaveLength(4)
      for (const paint of paints) {
        expect(paint.value).toBe(value)
        expect(paint.color).toBe(paint.foreground)
        expect(paint.fill).toBe(paint.foreground)
      }
      expect(await page.locator('[data-consumed]').count()).toBeGreaterThan(0)
    } finally { await page.close(); view.unmount() }
  })

  it.each(cases)('fits $cadence corrections in $locale at $width', async ({ width, locale, cadence }) => {
    const messages = locale === 'en' ? en : ptBR
    const translate = createTranslator({ locale, messages }) as (key: string, values?: Record<string, string | number>) => string
    const phrases = locale === 'en'
      ? { fixed: 'Read every Monday and Thursday at 08:00', flexible: 'Run 3 times a week', unresolved: 'Read', proposed: 'Read every Monday and Thursday at 08:00' }
      : { fixed: 'Ler toda segunda e quinta às 08:00', flexible: 'Correr 3 vezes por semana', unresolved: 'Ler', proposed: 'Ler toda segunda e quinta às 08:00' }
    const value = phrases[(cadence === 'locked' ? 'flexible' : cadence) as keyof typeof phrases]
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
      proposed={cadence === 'proposed'} scheduleLocked={cadence === 'locked'} quantity={parsed.frequencyQuantity ?? 3} mode={flexible ? 'flexible' : 'fixed'} sentence={sentence}
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
          return { width: bounds.width, height: bounds.height, top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, contained: bounds.left >= parent.left && bounds.right <= parent.right }
        })
        const emoji = main.querySelector('button[aria-haspopup="dialog"]')
        return { overflowing: main.scrollWidth > main.clientWidth, dayTargets, radius: emoji ? getComputedStyle(emoji).borderRadius : null,
          radioGroups: main.querySelectorAll('[role="radiogroup"]').length, buttonCount: main.querySelectorAll('button').length }
      })
      expect(measured.overflowing).toBe(false)
      expect(measured.radioGroups).toBe(0)
      expect(measured.radius).toBe(cadence === 'unresolved' ? null : '12px')
      expect(measured.buttonCount).toBe(expectedButtonCounts[cadence])
      for (let index = 1; index < measured.dayTargets.length; index++) {
        const previous = measured.dayTargets[index - 1]!
        const target = measured.dayTargets[index]!
        expect(target.top >= previous.bottom || target.left >= previous.right).toBe(true)
      }
      for (const target of measured.dayTargets) {
        expect(target).toMatchObject({ width: 48, height: 48, contained: true })
      }
      for (const control of await page.locator('main button:not([aria-haspopup])').all()) {
        expect(await control.isDisabled()).toBe(cadence === 'locked')
        await page.mouse.move(0, 0)
        const resting = await control.evaluate((element) => {
          const style = getComputedStyle(element)
          return { fill: style.backgroundColor, color: style.color }
        })
        const bounds = (await control.boundingBox())!
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        await page.waitForTimeout(300)
        const hovered = await control.evaluate((element) => {
          const style = getComputedStyle(element)
          return { fill: style.backgroundColor, color: style.color }
        })
        if (cadence === 'locked') expect(hovered).toEqual(resting)
        else expect(hovered.fill).not.toBe(resting.fill)
      }
    } finally { await page.close() }
  })
})

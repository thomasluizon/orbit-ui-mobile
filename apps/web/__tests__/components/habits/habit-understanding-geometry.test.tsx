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
import { HabitScheduleFields } from '@/components/habits/habit-form-fields/habit-schedule-fields'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const expectedButtonCounts: Readonly<Record<string, number>> = { daily: 8, fixed: 8, flexible: 10, unresolved: 10, proposed: 8, locked: 10 }

const defaultCases = [320, 360, 393, 412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) =>
  ['daily', 'fixed', 'flexible', 'unresolved', 'proposed', 'locked'].map((cadence) => ({ width, locale, cadence, scale: 1 })),
))

const cases = [...defaultCases, ...[320, 360, 393, 412].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale, cadence: 'daily', scale: 2 })))]

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

  it.each((['en', 'pt-BR'] as const).flatMap(locale => [false, true].map(proposed => ({ locale, proposed }))))('keeps emoji feedback full width and fill borders absent in $locale, proposed: $proposed', async ({ locale, proposed }) => {
    const messages = locale === 'en' ? en : ptBR
    const form = (busy: boolean) => <NextIntlClientProvider locale={locale} messages={messages}><HabitUnderstanding value="Run" emoji="🏃" proposed={proposed} days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]} showSchedule={false}
      labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} onSuggestEmoji={vi.fn()} canSuggestEmoji isEmojiSuggesting={busy} emojiSuggestionError={messages.habits.form.aiSuggestError} />
    </NextIntlClientProvider>
    const view = render(form(false))
    const page = await browser.newPage({ viewport: { width: 320, height: 1000 } })
    const mount = async () => {
      await page.setContent(`<style>${stylesheet}:root{font-size:32px}</style><main style="padding:16px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
    }
    try {
      await mount()
      const metrics = await page.getByRole('button', { name: messages.habits.form.suggestEmoji }).evaluate(button => {
        const styles = getComputedStyle(button)
        const ancestors = []
        for (let parent = button.parentElement; parent && !parent.hasAttribute('data-habit-title-row'); parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          ancestors.push({ border: style.borderWidth, outline: style.outlineStyle === 'none' ? '0px' : style.outlineWidth, shadow: style.boxShadow })
        }
        const error = document.querySelector('[role="alert"]')!
        return { border: styles.borderWidth, outline: styles.outlineStyle === 'none' ? '0px' : styles.outlineWidth, shadow: styles.boxShadow, radius: styles.borderRadius, ancestors,
          errorInTitleRow: Boolean(error.closest('[data-habit-title-row]')), errorWidth: error.getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth - innerWidth }
      })
      expect(metrics.border).toBe('0px')
      expect(metrics.outline).toBe('0px')
      expect(metrics.shadow).toBe('none')
      for (const ancestor of metrics.ancestors) expect(ancestor).toEqual({ border: '0px', outline: '0px', shadow: 'none' })
      expect(metrics.errorInTitleRow).toBe(false)
      expect(metrics.errorWidth).toBe(288)
      expect(metrics.overflow).toBe(0)
      const action = page.getByRole('button', { name: messages.habits.form.suggestEmoji })
      await action.focus()
      expect(await action.evaluate(button => ({ outline: getComputedStyle(button).outlineWidth, shadow: getComputedStyle(button).boxShadow, radius: getComputedStyle(button).borderRadius }))).toEqual({ outline: '2px', shadow: 'none', radius: metrics.radius })
      view.rerender(form(true))
      await mount()
      expect(await action.getAttribute('aria-busy')).toBe('true')
      expect(await action.locator('svg').count()).toBe(1)
      expect(await action.locator('[data-asset^="astra-mark"]').count()).toBe(0)
      view.rerender(form(false))
      await mount()
      expect(await action.getAttribute('aria-busy')).toBeNull()
      expect(await action.locator('[data-asset^="astra-mark"]').count()).toBe(1)
    } finally { await page.close(); view.unmount() }
  })

  it.each([393, 1280].flatMap(width => ['', 'Read every day'].map(value => ({ width, value }))))('keeps the emoji well trailing the title at $width for "$value"', async ({ width, value }) => {
    const view = render(<NextIntlClientProvider locale="en" messages={en}><HabitUnderstanding value={value} emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={value ? 'Every day' : null} consumed={[]} showSchedule={false}
      labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} onSuggestEmoji={vi.fn()} canSuggestEmoji={Boolean(value)} emojiSuggestionHint={value ? undefined : en.habits.form.titleRequired}>
      <Input label="Description" value="" onChange={vi.fn()} />
    </HabitUnderstanding></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="padding:16px;max-width:640px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const title = (await page.locator('[data-habit-phrase-field]').boundingBox())!
      const well = (await page.getByRole('button', { name: en.habits.form.emojiOpenPicker }).boundingBox())!
      const astra = (await page.getByRole('button', { name: en.habits.form.suggestEmoji }).boundingBox())!
      expect(well.y).toBeGreaterThanOrEqual(title.y)
      expect(well.y + well.height).toBeLessThanOrEqual(title.y + title.height)
      expect(well.x).toBeGreaterThan(title.x + title.width)
      expect(astra.y).toBe(well.y)
      const painted = (await page.locator('[data-emoji-well]').boundingBox())!
      expect(painted.width).toBe(46)
      expect(painted.height).toBe(46)
      expect(astra.x).toBeGreaterThanOrEqual(well.x + well.width)
      expect(astra.x + astra.width).toBeLessThanOrEqual(Math.min(width, 640) - 16)
      expect(await page.getByText(en.habits.form.titleRequired, { exact: true }).isVisible()).toBe(false)
      expect(await page.getByText(en.habits.form.emoji, { exact: true }).count()).toBe(0)
    } finally { await page.close(); view.unmount() }
  })

  it('leaves no empty feedback gap beside the emoji action and reveals real errors', async () => {
    const understanding = (error?: string) => <NextIntlClientProvider locale="en" messages={en}><HabitUnderstanding value="Read" emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]} showSchedule={false}
      labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} onSuggestEmoji={vi.fn()} canSuggestEmoji emojiSuggestionError={error} /></NextIntlClientProvider>
    const view = render(understanding())
    const page = await browser.newPage({ viewport: { width: 320, height: 1000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="padding:16px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const feedbackGap = () => page.locator('[role="alert"]').evaluate(element => element.parentElement!.getBoundingClientRect().bottom - element.previousElementSibling!.getBoundingClientRect().bottom)
      expect(await feedbackGap()).toBeLessThanOrEqual(1)
      view.rerender(understanding('Try again'))
      await page.setContent(`<style>${stylesheet}</style><main style="padding:16px">${view.container.innerHTML}</main>`)
      expect(await page.locator('[role="alert"]').isVisible()).toBe(true)
      expect(await feedbackGap()).toBeGreaterThan(8)
    } finally { await page.close(); view.unmount() }
  })

  it.each([320, 412, 1352])('starts the name at the standard field size and grows its mirror at %s', async (width) => {
    const understanding = (value: string) => <NextIntlClientProvider locale="en" messages={en}><HabitUnderstanding value={value} emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]} showSchedule={false}
      labels={buildHabitUnderstandingLabels(key => key)} onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} /></NextIntlClientProvider>
    const view = render(understanding('Read'))
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="padding:24px;max-width:640px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const field = page.locator('[data-habit-phrase-field]')
      expect((await field.boundingBox())!.height).toBe(54)
      view.rerender(understanding('A long title that keeps all its words\n'.repeat(5)))
      await page.setContent(`<style>${stylesheet}</style><main style="padding:24px;max-width:640px">${view.container.innerHTML}</main>`)
      await loadAppFonts(page)
      const metrics = await field.evaluate(element => {
        const input = element.querySelector('textarea')!
        const mirror = element.querySelector('p')!
        const a = input.getBoundingClientRect()
        const b = mirror.getBoundingClientRect()
        return { height: a.height, mirrorHeight: b.height, padding: getComputedStyle(input).padding, mirrorPadding: getComputedStyle(mirror).padding, overflow: input.scrollHeight - input.clientHeight }
      })
      expect(metrics.height).toBeGreaterThan(54)
      expect(metrics.height).toBe(metrics.mirrorHeight)
      expect(metrics.padding).toBe(metrics.mirrorPadding)
      expect(metrics.overflow).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount() }
  })

  it.each([320, 412, 1352])('contains manual schedule choices within their field column at %s', async (width) => {
    const view = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <HabitScheduleFields unit="Month" quantity={3} flexible disabled={false} onModeChange={vi.fn()} onChange={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><main style="padding:16px;max-width:620px">${view.container.innerHTML}</main>`)
      const groups = await page.locator('[role="radiogroup"]').evaluateAll((elements) => elements.map((element) => {
        const group = element.getBoundingClientRect()
        const parent = element.parentElement!.getBoundingClientRect()
        return { left: group.left - parent.left, right: parent.right - group.right }
      }))
      expect(groups).toHaveLength(2)
      for (const group of groups) {
        expect(group.left).toBeGreaterThanOrEqual(0)
        expect(group.right).toBeGreaterThanOrEqual(0)
      }
    } finally { await page.close(); view.unmount() }
  })


  it.each(['light', 'dark'] as const)('paints typed habit text with the foreground token in %s', async (mode) => {
    const value = 'Run Monday'
    const parsed = readHabitPhrase(value, 'en')
    const view = render(<NextIntlClientProvider locale="en" messages={en}><Input label="Single line" value={value} onChange={vi.fn()} /><Input label="Multiline" value={value} onChange={vi.fn()} multiline /><TypedTextarea aria-label="Primitive" value={value} onChange={vi.fn()} style={{ color: 'transparent' }} /><HabitUnderstanding value={value} emoji="" days={parsed.days} dayOptions={[]}
      quantity={1} mode="fixed" sentence={null} consumed={parsed.consumed} labels={buildHabitUnderstandingLabels((key) => key)}
      onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 412, height: 800 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, token]) => `${key}:${token}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${theme}}</style><main>${view.container.innerHTML}</main>`)
      await page.locator('[data-habit-phrase-field] textarea').focus()
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

  it.each(cases)('fits $cadence corrections in $locale at $width with text scale $scale', async ({ width, locale, cadence, scale }) => {
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
      expect(measured.radius).toBe('12px')
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
  })
})

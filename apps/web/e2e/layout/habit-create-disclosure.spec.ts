import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { dateInterpretationSchema } from '@orbit/shared/types/habit'
import { formatLocaleDate } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import { LAYOUT_FIXED_TIME } from './clock.mjs'

async function assertInlineGlyph(phrase: Locator, glyph: Locator, date: Locator) {
  const mark = glyph.locator('[data-asset="astra-mark"]')
  await expect(mark).toHaveCount(1)
  await expect(mark).toHaveAttribute('color', 'var(--fg-3)')
  await expect(glyph).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(glyph).toHaveCSS('border-width', '0px')
  await expect(glyph).toHaveCSS('box-shadow', 'none')
  const field = phrase.locator('xpath=ancestor::div[@data-focus-perimeter]')
  const fieldBounds = (await field.boundingBox())!
  const inputBounds = (await phrase.boundingBox())!
  const glyphBounds = (await mark.boundingBox())!
  const dateBounds = (await date.boundingBox())!
  expect(glyphBounds.x).toBeGreaterThanOrEqual(inputBounds.x + inputBounds.width - 1)
  expect(glyphBounds.x + glyphBounds.width).toBeLessThanOrEqual(fieldBounds.x + fieldBounds.width)
  expect(fieldBounds.x + fieldBounds.width - glyphBounds.x - glyphBounds.width).toBeLessThanOrEqual(40)
  expect(glyphBounds.y).toBeGreaterThanOrEqual(fieldBounds.y)
  expect(glyphBounds.y + glyphBounds.height).toBeLessThanOrEqual(fieldBounds.y + fieldBounds.height)
  expect(glyphBounds.width).toBe(16)
  expect(glyphBounds.height).toBe(16)
  expect(dateBounds.y).toBeGreaterThanOrEqual(fieldBounds.y + fieldBounds.height)
  expect(dateBounds.width).toBeGreaterThanOrEqual(48)
  expect(dateBounds.height).toBeGreaterThanOrEqual(48)
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [412, 1280]) {
    test.describe(`habit create disclosure in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('announces its state and reveals the Steps group', async ({ page }) => {
        await page.goto('/habits/new')
        const messages = locale === 'en' ? en : ptBr
        const screen = page.locator('[data-habit-create-screen]')
        const disclosure = screen.getByRole('button', { name: messages.habits.form.moreDetails, exact: true })
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

        await disclosure.click()
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
        await expect(disclosure).toHaveAttribute('aria-controls', /\S+/)
        const regionId = await disclosure.getAttribute('aria-controls')
        const region = screen.locator(`[id=${JSON.stringify(regionId)}]`)
        await expect(region).toHaveCount(1)
        await expect(region.getByRole('heading', { name: messages.habits.form.steps, exact: true })).toBeVisible()

        await disclosure.click()
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      })
    })
  }
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [320, 360, 384, 412, 1352]) {
    for (const mode of ['dark', 'light'] as const) {
      for (const scale of [1, 2]) {
        test.describe(`restored habit form ${locale} ${mode} ${width}px ${scale}x`, () => {
          test.use({ appLocale: locale, layoutProfile: { themePreference: mode, aiMessagesUsed: 0, aiMessagesLimit: 5 }, viewport: { width, height: 1000 } })
          test('keeps required type, local date, recovery and automatic interpretation distinct', async ({ page, context }) => {
            const interpretedDate = '2026-09-27'
            const interpreted = dateInterpretationSchema.parse({ date: interpretedDate, referenceDate: LAYOUT_FIXED_TIME.slice(0, 10) })
            await setLayoutFixtureSession(context, [{ method: 'POST', path: API.habits.interpretDate, body: interpreted, delayMs: 3000 }])
            await page.goto('/habits/new')
            const messages = locale === 'en' ? en : ptBr
            if (scale === 2) await page.addStyleTag({ content: ':root{font-size:32px!important}' })
            await page.evaluate(() => document.fonts.ready)
            const screen = page.locator('[data-habit-create-screen]')
            const submit = page.locator('[data-habit-create-action]').getByRole('button', { name: messages.habits.createTask, exact: true })
            await expect(submit).toBeEnabled()
            await submit.click()
            const task = screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeTask) })
            await expect(task).toBeChecked()
            await expect(screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeTask) })).toBeChecked()
            await task.click()
            await screen.getByRole('textbox', { name: messages.habits.form.taskDescribe, exact: true }).fill('Read every Monday')
            const phrase = screen.getByRole('textbox', { name: messages.habits.form.datePhrase, exact: true })
            const date = screen.getByRole('button', { name: new RegExp(messages.habits.form.taskDate) })
            await expect(date).toBeVisible()
            await expect(screen.getByRole('button', { name: messages.habits.form.moreDetails, exact: true })).toHaveAttribute('aria-expanded', 'false')
            await phrase.fill(locale === 'en' ? 'on the 26th' : 'dia 26')
            await expect(date).toHaveText(formatLocaleDate('2026-09-26', locale))
            await expect(screen.getByRole('button', { name: messages.habits.form.suggestDate, exact: true })).toHaveCount(0)
            await phrase.fill(locale === 'en' ? 'February 31' : '31 de fevereiro')
            await expect(phrase).toHaveAttribute('aria-invalid', 'true')
            await expect(screen.getByRole('button', { name: messages.habits.form.suggestDate, exact: true })).toHaveCount(0)
            await submit.click()
            await expect(phrase).toBeFocused()
            await phrase.fill(locale === 'en' ? 'after vacation' : 'depois das férias')
            const pending = screen.getByRole('status', { name: messages.habits.form.dateInterpreting, exact: true })
            await expect(pending).toBeVisible()
            await assertInlineGlyph(phrase, pending, date)
            const resolved = screen.getByRole('status', { name: messages.habits.form.dateInterpreted, exact: true })
            await expect(resolved).toBeVisible()
            await assertInlineGlyph(phrase, resolved, date)
            await expect(date).toHaveText(formatLocaleDate(interpretedDate, locale))
            await expect(phrase).toHaveValue(locale === 'en' ? 'after vacation' : 'depois das férias')
            await expect(phrase).not.toHaveAttribute('aria-invalid', 'true')
            await phrase.fill(locale === 'en' ? 'tomorrow' : 'amanhã')
            await expect(resolved).toHaveCount(0)
            await expect(date).toHaveText(formatLocaleDate('2026-09-05', locale))
            await expect(screen.getByRole('button', { name: messages.habits.form.suggestDate, exact: true })).toHaveCount(0)
            await expect(screen.getByRole('button', { name: messages.habits.form.acceptDate, exact: true })).toHaveCount(0)
            await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeHabit) }).click()
            const frequency = screen.getByRole('radiogroup', { name: messages.habits.form.frequency, exact: true })
            await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeTask) }).click()
            await screen.getByRole('radio', { name: messages.habits.form.noSchedule, exact: true }).click()
            await expect(phrase).toHaveCount(0)
            await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeHabit) }).click()
            await expect(frequency.getByRole('radio')).toHaveCount(2)
            await expect(screen.getByRole('button', { name: new RegExp(messages.habits.form.habitStartDate) })).toBeVisible()
            const geometry = await screen.evaluate((element) => ({
              scroll: document.documentElement.scrollWidth,
              viewport: innerWidth,
              controls: Array.from(element.querySelectorAll('[role="radio"], [data-habit-date-field] button')).map((control) => {
                const bounds = control.getBoundingClientRect()
                return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right }
              }),
            }))
            expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport + 1)
            for (const control of geometry.controls) {
              expect(control.width).toBeGreaterThanOrEqual(48)
              expect(control.height).toBeGreaterThanOrEqual(48)
              expect(control.left).toBeGreaterThanOrEqual(0)
              expect(control.right).toBeLessThanOrEqual(width)
            }
          })
        })
      }
    }
  }
}

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`habit date before profile loading in ${locale}`, () => {
    test.use({ appLocale: locale, layoutProfile: { themePreference: 'light' }, viewport: { width: 384, height: 1000 } })
    test('applies the typed date after the profile response is released', async ({ page }) => {
      let releaseProfile!: () => void
      const profileReady = new Promise<void>((resolve) => { releaseProfile = resolve })
      await page.route(`**${API.profile.get}`, async (route) => {
        await profileReady
        await route.continue()
      })
      const messages = locale === 'en' ? en : ptBr
      const wording = locale === 'en' ? 'on the 26th' : 'dia 26'
      const screen = page.locator('[data-habit-create-screen]')
      const phrase = screen.getByRole('textbox', { name: messages.habits.form.datePhrase, exact: true })
      const date = screen.getByRole('button', { name: new RegExp(messages.habits.form.taskDate) })
      try {
        await page.goto('/habits/new')
        await page.addStyleTag({ content: ':root{font-size:32px!important}' })
        await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeTask) }).click()
        await phrase.fill(wording)
        await expect(phrase).toHaveValue(wording)
        await expect(date).toHaveText(messages.common.selectDate)
      } finally {
        releaseProfile()
      }
      await expect(date).toHaveText(formatLocaleDate('2026-09-26', locale))
      await expect(phrase).toHaveValue(wording)
      await expect(phrase).not.toHaveAttribute('aria-invalid', 'true')
      await expect(screen.getByRole('status', { name: messages.habits.form.dateInterpreted, exact: true })).toHaveCount(0)
    })
  })
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const unavailable of ['offline', 'allowance'] as const) {
    test.describe(`automatic habit date recovery in ${locale} when ${unavailable}`, () => {
      test.use({ appLocale: locale, viewport: { width: 320, height: 1000 }, layoutProfile: { aiMessagesUsed: unavailable === 'allowance' ? 5 : 0, aiMessagesLimit: 5 } })
      test('keeps local parsing and manual selection without calling Astra', async ({ page, context }) => {
        const messages = locale === 'en' ? en : ptBr
        await page.goto('/habits/new')
        const screen = page.locator('[data-habit-create-screen]')
        await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeTask) }).click()
        const phrase = screen.getByRole('textbox', { name: messages.habits.form.datePhrase, exact: true })
        const date = screen.getByRole('button', { name: new RegExp(messages.habits.form.taskDate) })
        const consultations: string[] = []
        page.on('request', (request) => {
          if (request.method() === 'POST' && new URL(request.url()).pathname === '/habits/new') consultations.push(request.url())
        })
        if (unavailable === 'offline') await context.setOffline(true)
        await phrase.fill(locale === 'en' ? 'tomorrow' : 'amanhã')
        await expect(date).toHaveText(formatLocaleDate('2026-09-05', locale))
        await phrase.fill(locale === 'en' ? 'on the 3rd' : 'dia 3')
        await expect(date).toHaveText(formatLocaleDate('2026-10-03', locale))
        await phrase.fill(locale === 'en' ? 'after vacation' : 'depois das férias')
        await expect(phrase).toHaveAttribute('aria-invalid', 'true')
        await expect(screen.getByText(messages.habits.form.datePhraseUnresolved, { exact: true })).toBeVisible()
        await page.waitForTimeout(1000)
        expect(consultations).toEqual([])
        await expect(screen.getByRole('status', { name: /Astra/ })).toHaveCount(0)
        await expect(date).toBeEnabled()
        await date.click()
        await page.locator('button[data-day="2026-10-03"]').click()
        await expect(phrase).toHaveValue('')
        await expect(phrase).not.toHaveAttribute('aria-invalid', 'true')
        await expect(date).toHaveText(formatLocaleDate('2026-10-03', locale))
        if (unavailable === 'offline') await context.setOffline(false)
      })
    })
  }
}

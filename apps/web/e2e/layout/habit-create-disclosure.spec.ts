import { expect, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { formatLocaleDate } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { escapeRegExp, guidedRow, guidedSummary, reachCreateSummary } from './guided-habit-steps'

type Messages = typeof en

async function reachWhenQuestion(page: Page, messages: Messages) {
  await page.goto('/habits/new')
  await page.getByRole('textbox', { name: messages.habits.flow.what.label, exact: true }).fill('Prepare coffee')
  await page.getByRole('button', { name: messages.habits.flow.continue, exact: true }).click()
  await expect(page.getByRole('heading', { name: messages.habits.flow.when.question, exact: true })).toBeVisible()
  return {
    phrase: page.getByRole('textbox', { name: messages.habits.flow.when.freeLabel, exact: true }),
    date: page.getByRole('button', { name: new RegExp(messages.habits.flow.when.calendar) }),
  }
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [412, 1280]) {
    test.describe(`habit create optional questions in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('lists the optional questions from the summary and returns to it', async ({ page }) => {
        await page.goto('/habits/new')
        const messages = locale === 'en' ? en : ptBr
        await reachCreateSummary(page, messages)
        await guidedRow(guidedSummary(page, messages), messages.habits.flow.more).click()
        const list = page.getByRole('list', { name: messages.habits.flow.more, exact: true })
        await expect(list).toBeVisible()
        await expect(list.getByRole('button', { name: new RegExp(`^${escapeRegExp(messages.habits.flow.optional.checklist)}`) })).toBeVisible()
        for (const row of await list.getByRole('button').all()) {
          const bounds = (await row.boundingBox())!
          expect(bounds.height).toBeGreaterThanOrEqual(48)
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        }
        await page.getByRole('button', { name: messages.habits.flow.continue, exact: true }).click()
        await expect(guidedSummary(page, messages)).toBeVisible()
      })
    })
  }
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [320, 384, 412, 1352]) {
    for (const scale of [1, 2]) {
      test.describe(`guided date question ${locale} ${width}px ${scale}x`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 1000 } })

        test('reads the typed words, refuses a day that does not exist and keeps every control reachable', async ({ page }) => {
          const messages = locale === 'en' ? en : ptBr
          const { phrase, date } = await reachWhenQuestion(page, messages)
          if (scale === 2) await page.addStyleTag({ content: ':root{font-size:32px!important}' })
          await page.evaluate(() => document.fonts.ready)
          await phrase.fill(locale === 'en' ? 'on the 26th' : 'dia 26')
          await expect(date).toContainText(formatLocaleDate('2026-09-26', locale))
          await phrase.fill(locale === 'en' ? 'February 31' : '31 de fevereiro')
          await phrase.press('Enter')
          await expect(phrase).toHaveAttribute('aria-invalid', 'true')
          await expect(page.getByText(messages.habits.flow.when.unresolved, { exact: true })).toBeVisible()
          await phrase.fill(locale === 'en' ? 'tomorrow' : 'amanhã')
          await expect(date).toContainText(formatLocaleDate('2026-09-05', locale))
          await expect(phrase).not.toHaveAttribute('aria-invalid', 'true')
          const geometry = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            viewport: innerWidth,
            controls: Array.from(document.querySelectorAll('[data-option-group] button, [data-flow-scroll] input')).map((control) => {
              const bounds = control.getBoundingClientRect()
              return { height: bounds.height, left: bounds.left, right: bounds.right }
            }),
          }))
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport + 1)
          const dateBounds = (await date.boundingBox())!
          expect(dateBounds.height).toBeGreaterThanOrEqual(48)
          expect(dateBounds.x + dateBounds.width).toBeLessThanOrEqual(width)
          for (const control of geometry.controls) {
            expect(control.height).toBeGreaterThanOrEqual(48)
            expect(control.left).toBeGreaterThanOrEqual(0)
            expect(control.right).toBeLessThanOrEqual(width)
          }
        })
      })
    }
  }
}

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`guided date before profile loading in ${locale}`, () => {
    test.use({ appLocale: locale, layoutProfile: { themePreference: 'light' }, viewport: { width: 384, height: 1000 } })
    test('applies the typed date when the words are sent after the profile response is released', async ({ page }) => {
      let releaseProfile!: () => void
      const profileReady = new Promise<void>((resolve) => { releaseProfile = resolve })
      await page.route(`**${API.profile.get}`, async (route) => {
        await profileReady
        await route.continue()
      })
      const messages = locale === 'en' ? en : ptBr
      const wording = locale === 'en' ? 'on the 26th' : 'dia 26'
      const profileLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === API.profile.get)
      try {
        const { phrase } = await reachWhenQuestion(page, messages)
        await phrase.fill(wording)
        await expect(phrase).toHaveValue(wording)
      } finally {
        releaseProfile()
      }
      await profileLoaded
      await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(resolve) }) }))
      const phrase = page.getByRole('textbox', { name: messages.habits.flow.when.freeLabel, exact: true })
      await expect(phrase).toHaveValue(wording)
      await expect(phrase).not.toHaveAttribute('aria-invalid', 'true')
      await phrase.press('Enter')
      await page.getByRole('group', { name: messages.habits.flow.time.question, exact: true }).getByRole('button', { name: messages.habits.flow.time.none, exact: true }).click()
      const summary = guidedSummary(page, messages)
      await expect(guidedRow(summary, messages.habits.flow.summary.when)).toContainText(formatLocaleDate('2026-09-26', locale))
    })
  })
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const unavailable of ['offline', 'allowance'] as const) {
    test.describe(`guided date recovery in ${locale} when ${unavailable}`, () => {
      test.use({ appLocale: locale, viewport: { width: 320, height: 1000 }, layoutProfile: { aiMessagesUsed: unavailable === 'allowance' ? 5 : 0, aiMessagesLimit: 5 } })
      test('keeps local reading and manual selection without calling Orbit', async ({ page, context }) => {
        const messages = locale === 'en' ? en : ptBr
        const { phrase, date } = await reachWhenQuestion(page, messages)
        const consultations: string[] = []
        page.on('request', (request) => {
          if (request.method() === 'POST' && new URL(request.url()).pathname === '/habits/new') consultations.push(request.url())
        })
        if (unavailable === 'offline') await context.setOffline(true)
        await phrase.fill(locale === 'en' ? 'tomorrow' : 'amanhã')
        await expect(date).toContainText(formatLocaleDate('2026-09-05', locale))
        await phrase.fill(locale === 'en' ? 'on the 3rd' : 'dia 3')
        await expect(date).toContainText(formatLocaleDate('2026-10-03', locale))
        await phrase.fill(locale === 'en' ? 'after vacation' : 'depois das férias')
        await phrase.press('Enter')
        await expect(phrase).toHaveAttribute('aria-invalid', 'true')
        await expect(page.getByText(messages.habits.flow.when.unresolved, { exact: true })).toBeVisible()
        await page.waitForTimeout(1000)
        expect(consultations).toEqual([])
        await expect(date).toBeEnabled()
        await date.click()
        await page.locator('button[data-day="2026-10-03"]').click()
        await expect(page.getByRole('heading', { name: messages.habits.flow.time.question, exact: true })).toBeVisible()
        if (unavailable === 'offline') await context.setOffline(false)
      })
    })
  }
}

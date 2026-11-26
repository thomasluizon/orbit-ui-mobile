import { expect, type Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { API } from '@orbit/shared/api'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { guidedRow, guidedSummary } from './guided-habit-steps'

async function expectControlsFit(page: Page, width: number) {
  const geometry = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    controls: Array.from(document.querySelectorAll('[data-question-flow] [data-option-group] button, [data-question-flow] [data-question-row], [data-question-flow] input, [data-question-flow] [role="combobox"]'))
      .map((control) => {
        const bounds = control.getBoundingClientRect()
        return { label: control.textContent.slice(0, 40), width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right, clipped: control.scrollWidth > control.clientWidth + 1 && control.tagName === 'BUTTON' }
      })
      .filter((control) => control.width > 0),
  }))
  expect(geometry.scroll).toBeLessThanOrEqual(width)
  expect(geometry.controls.length).toBeGreaterThan(0)
  for (const control of geometry.controls) {
    expect(control.left, control.label).toBeGreaterThanOrEqual(0)
    expect(control.right, control.label).toBeLessThanOrEqual(width)
    expect(control.height, control.label).toBeGreaterThanOrEqual(44)
    expect(control.clipped, control.label).toBe(false)
  }
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [320, 360, 384, 412, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test.describe(`form decisions ${locale} ${width}px ${theme}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 1000 }, layoutProfile: { themePreference: theme } })
        test('opens an undated task from General with its date locked and no repetition controls', async ({ page, context }) => {
          const messages = locale === 'en' ? en : ptBR
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: emptyHabitsPageFixture }])
          await page.goto('/')
          await page.getByRole('radiogroup', { name: messages.habits.viewsLabel }).getByRole('radio', { name: messages.habits.viewGeneral, exact: true }).click()
          await page.getByRole('button', { name: messages.habits.createManually, exact: true }).click()
          await expect(page.getByRole('heading', { name: messages.habits.flow.what.question, exact: true })).toBeVisible()
          await page.getByRole('textbox', { name: messages.habits.flow.what.label, exact: true }).fill('Read')
          await page.getByRole('button', { name: messages.habits.flow.continue, exact: true }).click()
          const summary = guidedSummary(page, messages)
          await expect(summary).toBeVisible()
          const when = guidedRow(summary, messages.habits.flow.summary.when)
          await expect(when).toContainText(messages.habits.flow.summary.noDate)
          await expect(guidedRow(summary, messages.habits.flow.summary.time)).toHaveCount(0)
          await expect(summary.getByRole('radiogroup')).toHaveCount(0)
          const bounds = (await when.boundingBox())!
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
          expect(bounds.height).toBeGreaterThanOrEqual(48)
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          await expect(page.getByRole('button', { name: messages.habits.createTask, exact: true })).toBeVisible()
        })

        test('keeps one question per step with every control inside the column, down to the reminder', async ({ page }) => {
          const messages = locale === 'en' ? en : ptBR
          const flow = messages.habits.flow
          await page.goto('/habits/new')
          await expect(page.getByRole('heading', { name: flow.what.question, exact: true })).toHaveCSS('font-size', width >= 1024 ? '34px' : '28px')
          await page.getByRole('textbox', { name: flow.what.label, exact: true }).fill('Read')
          await page.getByRole('button', { name: flow.continue, exact: true }).click()
          await expect(page.getByRole('heading', { name: flow.when.question, exact: true })).toBeVisible()
          await expect(page.locator('h1')).toHaveCount(1)
          await expectControlsFit(page, width)
          await page.getByRole('group', { name: flow.when.question, exact: true }).getByRole('button', { name: flow.when.everyDay, exact: true }).click()
          await expect(page.getByRole('heading', { name: flow.time.question, exact: true })).toBeVisible()
          await expect(page.locator('h1')).toHaveCount(1)
          await expectControlsFit(page, width)
          await page.getByRole('group', { name: flow.time.question, exact: true }).getByRole('button', { name: flow.time.none, exact: true }).click()
          const summary = guidedSummary(page, messages)
          await expect(summary).toBeVisible()
          await expectControlsFit(page, width)
          await guidedRow(summary, flow.summary.reminder).click()
          await expect(page.getByRole('heading', { name: flow.reminderKind.question, exact: true })).toBeVisible()
          await page.getByRole('group', { name: flow.reminderKind.question, exact: true }).getByRole('button', { name: flow.reminderKind.repeat, exact: true }).click()
          await expect(page.getByRole('combobox', { name: messages.habits.form.repeatInterval, exact: true })).toBeVisible()
          await expectControlsFit(page, width)
        })
      })
    }
  }
}

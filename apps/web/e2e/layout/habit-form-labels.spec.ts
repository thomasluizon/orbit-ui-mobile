import { setLayoutFixtureSession } from './profile-session'
import { expect, type Locator } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

async function assertFieldEdges(disclosure: Locator, descriptionOwner: Locator) {
  const timeLabel = disclosure.getByRole('heading', { name: messages.habits.form.checklist, exact: true })
  const descriptionLabel = descriptionOwner.locator('label').filter({ hasText: messages.habits.form.description })
  await expect(timeLabel).toBeVisible()
  await expect(descriptionLabel).toHaveCount(1)
  await expect(descriptionLabel).toBeVisible()
  const edge = await timeLabel.evaluate((element) => element.getBoundingClientRect().left)
  const color = await timeLabel.evaluate((element) => getComputedStyle(element).color)
  const labels = [descriptionLabel, ...await disclosure.getByRole('heading', { level: 2 }).all()]
  expect(labels.length).toBeGreaterThanOrEqual(3)
  for (const label of labels) {
    await expect(label).toBeVisible()
    await expect(label).toHaveCSS('font-size', '14px')
    await expect(label).toHaveCSS('font-weight', '500')
    await expect(label).toHaveCSS('color', color)
  }
  expect(await descriptionLabel.evaluate((element) => element.getBoundingClientRect().left))
    .toBeCloseTo(await descriptionOwner.evaluate((element) => element.getBoundingClientRect().left), 1)
  for (const label of labels.slice(1)) {
    expect(await label.evaluate((element) => element.getBoundingClientRect().left)).toBeCloseTo(edge, 1)
  }
  const controls = await disclosure.getByRole('heading', { level: 2 }).evaluateAll((headings) =>
    headings.map((heading) => ({
      label: heading.textContent,
      start: heading.nextElementSibling?.getBoundingClientRect().left,
    })))
  for (const control of controls) {
    expect(control.start, control.label).toBeDefined()
    expect(control.start, control.label).toBeCloseTo(edge, 1)
  }
  const rows = await disclosure.locator('.orbit-list-row-shell').evaluateAll((elements) =>
    elements.map((element) => element.firstElementChild!.getBoundingClientRect().left))
  for (const start of rows) expect(start).toBeCloseTo(edge, 1)
}

async function assertDescriptionOrder(screen: Locator) {
  const description = screen.getByRole('textbox', { name: messages.habits.form.description, exact: true })
  await expect(description).toHaveCount(1)
  await expect(description).toBeVisible()
  await expect(description).toHaveAttribute('maxlength', '10000')
  const descriptionOwner = description.locator('xpath=ancestor::div[@data-input-root]')
  await expect(descriptionOwner).toHaveCount(1)
  const name = screen.locator('[data-habit-phrase-field] textarea')
  expect(await descriptionOwner.evaluate((element) => element.getBoundingClientRect().left))
    .toBeCloseTo(await name.evaluate((element) => element.getBoundingClientRect().left), 1)
  expect(await descriptionOwner.evaluate((element, moreDetails) => {
    const fields = element.parentElement!.parentElement!
    const title = fields.querySelector('[data-habit-phrase-field]')!
    const date = fields.querySelector('[data-habit-date-field]')!
    const disclosure = [...fields.querySelectorAll('button')].find((button) => button.textContent.trim() === moreDetails)!
    return element.previousElementSibling?.contains(title)
      && Boolean(element.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(date.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !disclosure.contains(element)
  }, messages.habits.form.moreDetails)).toBe(true)
  return descriptionOwner
}

const metrics = habitMetricsSchema.parse({
  currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100,
  monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null,
})

for (const width of [412, 1352]) {
  test.describe(`habit disclosure field labels at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test.beforeEach(async ({ context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language: 'pt-BR', hasProAccess: true }) }])
    })

    test('aligns create labels and controls with and without an exact time', async ({ page }) => {
      await page.goto('/habits/new')
      const screen = page.locator('[data-habit-create-screen]')
      const descriptionOwner = await assertDescriptionOrder(screen)
      await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeHabit) }).click()
      await screen.getByRole('button', { name: messages.habits.form.moreDetails }).click()
      const disclosure = screen.locator('.habit-form-disclosure[data-open="true"]')
      await disclosure.getByRole('switch', { name: messages.habits.form.habitTypeAvoid }).click()
      await page.evaluate(() => document.fonts.ready)
      await expect(disclosure.getByRole('heading', { name: messages.habits.form.slipAlert })).toBeVisible()
      await expect(disclosure.getByRole('heading', { name: messages.habits.form.subHabits })).toBeVisible()
      await assertFieldEdges(disclosure, descriptionOwner)
      await assertDescriptionOrder(screen)
      await screen.getByRole('button', { name: new RegExp(messages.habits.form.timingAndReminder) }).click()
      const timing = page.getByRole('dialog', { name: messages.habits.form.timingAndReminder, exact: true })
      await timing.getByRole('textbox', { name: messages.habits.form.exactTime, exact: true }).fill('08:00')
      await timing.getByRole('button', { name: messages.common.done, exact: true }).click()
      await assertFieldEdges(disclosure, descriptionOwner)
    })

    for (const dueTime of [null, '08:00:00']) {
      test(`aligns habit detail labels and editors with time ${dueTime ?? 'unset'}`, async ({ page, context }) => {
        const habit = habitDetailSchema.parse({
          ...makeHabitDetail(), dueTime,
          checklistItems: [{ text: 'Preparar a água', isChecked: false }],
        })
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))
        await page.goto(`/habits/${habit.id}`)
        await page.getByRole('button', { name: messages.habits.editHabit }).click()
        const editor = page.getByRole('dialog', { name: messages.habits.editHabit, exact: true })
        await expect(editor.getByRole('heading', { name: messages.habits.editHabit, exact: true })).toHaveCSS('font-size', '22px')
        const disclosure = editor.locator('form .habit-form-disclosure[data-open="true"]')
        await page.evaluate(() => document.fonts.ready)
        const descriptionOwner = await assertDescriptionOrder(editor)
        await assertFieldEdges(disclosure, descriptionOwner)
      })
    }
  })
}

import { readExpandedControlGeometry } from './expanded-control-geometry'
import { expect, test, type Page, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { goalSchema } from '@orbit/shared/types/goal'
import { tagListSchema } from '@orbit/shared/types/tag'
import { profileSchema } from '@orbit/shared/types/profile'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { measureFieldInset } from './field-inset-geometry'
import { setLayoutProfileSession } from './profile-session'

type Messages = typeof en | typeof ptBr

async function expectVisibleFieldInsets(page: Page, messages: Messages, scope?: Locator) {
  await page.evaluate(() => document.fonts.ready)
  const rules = [
    { selector: '[data-input-root] input, [data-input-root] textarea, .form-input, [cmdk-input], [data-hour-cycle], [data-habit-phrase-field] textarea', padding: 16 },
    { selector: '[data-composer-input]', padding: 8 },
    { selector: `[data-habit-detail-content] input[aria-label=${JSON.stringify(messages.habits.detail.rename)}]`, padding: 0 },
    { selector: `input[placeholder=${JSON.stringify(messages.habits.form.checklistPlaceholder)}], input[aria-label=${JSON.stringify(messages.habits.form.tagName)}]`, padding: 12 },
    { selector: `input[aria-label^=${JSON.stringify(messages.habits.form.checklistItemLabel.split('{n}')[0])}]`, padding: 8 },
  ]
  const fields = (scope ?? page).locator('input:visible:not([type="file"]):not([autocomplete="one-time-code"]), textarea:visible')
  expect(await fields.count()).toBeGreaterThan(0)
  for (const field of await fields.all()) {
    const expected = await field.evaluate((element, registry) => registry.find(rule => element.matches(rule.selector))?.padding, rules)
    expect(expected, `inventory entry for ${await field.getAttribute('aria-label') ?? await field.getAttribute('placeholder')}`).toBeDefined()
    const before = await field.evaluate(measureFieldInset)
    expect(before.paddingStart).toBe(expected)
    expect(before.inset - before.borderStart).toBeCloseTo(expected!, 1)
    if (await field.getAttribute('data-composer-input') !== null) continue
    const original = await field.inputValue()
    await field.fill(await field.getAttribute('data-hour-cycle') ? '08:00' : 'M')
    const typed = await field.evaluate(measureFieldInset)
    expect(typed.inset - typed.borderStart).toBeCloseTo(expected!, 1)
    expect(typed.inset).toBeCloseTo(before.inset, 1)
    await field.fill(original)
  }
}

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const width of [320, 412, 1352]) {
    test.describe(`${locale} field inventory at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })
      test.beforeEach(async ({ context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await setLayoutProfileSession(context, profileSchema.parse({ ...profileFixture, language: locale }))
      })

      for (const path of ['/search', '/support']) {
        test(`measures every visible field on ${path}`, async ({ page }) => {
          await page.goto(path)
          await expect(page.locator('input:visible, textarea:visible').first()).toBeVisible()
          await expectVisibleFieldInsets(page, messages)
        })
      }

      test('measures the habit detail composer and inline title', async ({ page, context }) => {
        const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title: 'Routine', children: [] })
        const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100,
          monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, route => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, route => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, route => route.fulfill({ json: metrics }))
        await page.goto(`/habits/${habit.id}`)
        const title = page.locator('[data-habit-detail-content] h1 > button')
        await expect(title).toHaveText(habit.title)
        const hit = await title.evaluate(readExpandedControlGeometry)
        expect(hit.height).toBeGreaterThanOrEqual(48)
        expect(hit.edgeHits).toEqual([true, true, true, true])
        const composer = page.locator('[data-composer-input]:visible')
        await expect(composer).toBeVisible()
        expect((await composer.evaluate(measureFieldInset)).pillInset).toBeCloseTo(60, 1)
        await expectVisibleFieldInsets(page, messages)
        await title.click()
        await expect(page.getByRole('textbox', { name: messages.habits.detail.rename })).toBeVisible()
        await expectVisibleFieldInsets(page, messages)
      })

      test('measures sentence, checklist, description, tag and goal search fields', async ({ page, context }) => {
        const tags = tagListSchema.parse(Array.from({ length: 21 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#808080' })))
        const goals = Array.from({ length: 21 }, (_, index) => goalSchema.parse({
          id: `goal-${index}`, title: `Goal ${index}`, description: null, targetValue: 10, currentValue: 0,
          unit: 'times', type: 'Standard', status: 'Active', deadline: null, position: index,
          createdAtUtc: '2025-01-01T00:00:00Z', completedAtUtc: null, progressPercentage: 0, linkedHabits: [],
        }))
        const profile = profileSchema.parse({ ...profileFixture, language: locale })
        await setLayoutProfileSession(context, profile, undefined, tags)
        await context.route(url => url.pathname === API.goals.list, route => route.fulfill({ json: { ...emptyGoalsPageFixture, items: goals, totalCount: goals.length } }))
        await page.goto('/habits/new')
        const screen = page.locator('[data-habit-create-screen]')
        await expect(screen).toBeVisible()
        await screen.getByRole('button', { name: messages.habits.form.moreDetails }).click()
        await expect(screen.getByPlaceholder(messages.habits.form.checklistPlaceholder)).toBeVisible()
        await expectVisibleFieldInsets(page, messages)
        await screen.getByPlaceholder(messages.habits.form.checklistPlaceholder).fill('M')
        await screen.getByPlaceholder(messages.habits.form.checklistPlaceholder).press('Enter')
        await expectVisibleFieldInsets(page, messages)
        for (const [title, searchLabel] of [[messages.habits.form.tags, messages.habits.form.searchTags], [messages.habits.form.goals, messages.habits.form.searchGoals]] as const) {
          await screen.getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).click()
          const dialog = page.getByRole('dialog', { name: title })
          const search = dialog.getByRole('textbox', { name: searchLabel })
          await expect(search).toBeVisible()
          await expectVisibleFieldInsets(page, messages, dialog)
          expect((await search.evaluate(measureFieldInset)).minimumHeight).toBe(54)
          await page.keyboard.press('Escape')
          await expect(dialog).not.toBeVisible()
        }
      })
    })
  }
}

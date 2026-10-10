import { setLayoutFixtureSession } from './profile-session'
import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem, makeHabitDetail, makeHabitDetailChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema, habitDetailSchema } from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { tagListSchema } from '@orbit/shared/types/tag'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { test } from './upgrade-fixtures'

const day = '2026-09-04'
const names = ['UnbrokenToken'.repeat(24), 'Read the books I chose to learn about all the places and people around the world before breakfast every morning']

async function checkTypedHeadline(page: Page, scope: Locator, name: string) {
  const title = scope.locator('[data-personal-text]').filter({ hasText: name }).first()
  await expect(title).toBeVisible()
  await markUserText(page, names)
  await expectLabelsFit(page, scope, [name])
  expect(await title.evaluate((element) => {
    const style = getComputedStyle(element)
    return { whiteSpace: style.whiteSpace, wordBreak: style.wordBreak, clamp: style.webkitLineClamp }
  })).toEqual({ whiteSpace: name.includes(' ') ? 'normal' : 'nowrap', wordBreak: 'normal', clamp: name.includes(' ') ? '2' : 'none' })
}

for (const width of [320, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const [index, name] of names.entries()) {
      test.describe(`${locale} typed slots at ${width}px with name ${index}`, () => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale, hasProAccess: true })
        const tags = tagListSchema.parse([{ id: 'long-tag', name, color: '#808080' }])
        const goals = paginatedGoalResponseSchema.parse({ items: [createMockGoal({ id: 'long-goal', title: name })], page: 1, pageSize: 100, totalPages: 1, totalCount: 1 })
        const child = habitScheduleItemSchema.parse(makeHabitScheduleItem({ id: 'child-habit', title: 'Read', children: [], hasSubHabits: false, dueDate: day, scheduledDates: [day] }))
        const parent = habitScheduleItemSchema.parse(makeHabitScheduleItem({ id: 'parent-habit', title: name, children: [child], hasSubHabits: true, dueDate: day, scheduledDates: [day] }))
        const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ ...emptyHabitsPageFixture, items: [parent], totalCount: 1 })
        test.use({ appLocale: locale, layoutProfile: profile, layoutTags: [tags, { scope: 'test' }], viewport: { width, height: 915 } })
        test.beforeEach(async ({ context }) => {
          await context.route((url) => url.pathname === API.goals.list, (route) => route.fulfill({ json: goals }))
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
          await context.route((url) => url.pathname === API.habits.get(parent.id), (route) => route.fulfill({ json: habitDetailSchema.parse({ ...makeHabitDetail(), id: parent.id, title: name, children: [{ ...makeHabitDetailChild(), id: child.id, title: child.title, dueDate: day }] }) }))
        })

        test('fits and discloses picker names without toggling them', async ({ page }) => {
          await page.goto('/habits/new')
          const form = page.locator('[data-habit-create-screen]')
          await form.getByRole('button', { name: words.habits.form.moreDetails }).click()
          for (const label of [words.habits.form.goals, words.habits.form.tags]) {
            await form.getByRole('button').filter({ has: page.getByText(label, { exact: true }) }).click()
            const picker = page.getByRole('dialog', { name: label, exact: true })
            await checkTypedHeadline(page, picker, name)
            const toggle = picker.locator('button[aria-pressed]').filter({ hasText: name })
            await expect(toggle).toHaveCount(1)
            await expect(toggle).toHaveAccessibleName(name)
            await expect(toggle).toHaveAttribute('aria-pressed', 'false')
            await picker.getByRole('button', { name: words.common.showFullText.replace('{name}', name), expanded: false, exact: true }).click()
            const full = page.getByRole('dialog', { name, exact: true })
            await expect(full.locator('[data-personal-text-expanded]').last()).toHaveText(name)
            await full.getByRole('button', { name: words.common.close, exact: true }).click()
            await expect(toggle).toHaveAttribute('aria-pressed', 'false')
            await picker.getByRole('button', { name: words.common.close, exact: true }).click()
          }
        })

        test('fits and discloses the drill heading while preserving back', async ({ page }) => {
          await page.goto(`/?date=${day}`)
          const row = page.locator('[data-habit-title]').filter({ has: page.locator('[data-personal-text]', { hasText: name }) }).first()
          await row.locator('[data-habit-row-control="menu"]').click()
          await page.getByRole('menu', { name, exact: true }).getByRole('menuitem', { name: words.habits.actions.openSubHabits, exact: true }).click()
          const heading = page.getByRole('heading', { name, level: 2, exact: true })
          await markRequiredLabels(heading.locator('..').getByText(words.habits.drillProgress.replace('{done}', '0').replace('{total}', '1'), { exact: true }))
          await checkTypedHeadline(page, page.getByRole('main'), name)
          await expect(heading.locator('[data-personal-text]')).toHaveAttribute('aria-label', name)
          await page.getByRole('button', { name: words.common.showFullText.replace('{name}', name), expanded: false, exact: true }).click()
          const full = page.getByRole('dialog', { name, exact: true })
          await expect(full.locator('[data-personal-text-expanded]').last()).toHaveText(name)
          await full.getByRole('button', { name: words.common.close, exact: true }).click()
          await page.getByRole('button', { name: words.common.back, exact: true }).click()
          await expect(row).toBeVisible()
        })
      })
    }
  }
}

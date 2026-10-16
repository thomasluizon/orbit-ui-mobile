import { openTodayListOptions } from './hydration-guard'
import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'

test.use({ viewport: { width: 1352, height: 915 } })

test('keeps both client-rendered delete actions padded on both sides', async ({ page, context }) => {
  const habit = makeHabitScheduleItem({
    title: 'Beber água',
    dueDate: '2026-09-04',
    scheduledDates: ['2026-09-04'],
    children: [],
    hasSubHabits: false,
  })
  const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
    items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
  })
  const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
  await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
  await setLayoutProfileSession(context, profile)
  await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
  await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habitsPage }])

  await page.goto('/')
  await openTodayListOptions(page, ptBr.habits.listOptions)
  await page.getByRole('menuitem', { name: ptBr.habits.refresh }).click()

  const row = page.getByTestId('habit-row').filter({ has: page.getByText(habit.title, { exact: true }) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: ptBr.habits.actions.more }).click()
  await page.getByRole('menuitem', { name: ptBr.habits.actions.delete }).click()

  const dialog = page.getByRole('dialog', { name: ptBr.habits.deleteConfirmTitle })
  await expect(dialog).toBeVisible()
  for (const label of [ptBr.common.cancel, ptBr.habits.deleteHabit]) {
    const action = dialog.getByRole('button', { name: label, exact: true })
    await expect(action).toBeVisible()
    const padding = await action.evaluate((element) => {
      const style = getComputedStyle(element)
      return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) }
    })
    expect(padding.left, `${label} start padding`).toBeGreaterThan(0)
    expect(padding.left, `${label} has symmetric padding`).toBeCloseTo(padding.right, 1)
  }
})

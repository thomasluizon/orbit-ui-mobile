import { openTodayListOptions } from './hydration-guard'
import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { test } from './upgrade-fixtures'
import { expectCompactFabNoticeGeometry } from './fab-notice-geometry'

const today = '2026-09-04'
const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Beber água',
  dueDate: today,
  scheduledDates: [today],
  children: [],
  hasSubHabits: false,
}))
const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})

for (const width of [412, 600] as const) {
  test.describe(`compact FAB and notice at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('keeps the FAB above the notice control and the composer', async ({ page, context }) => {
      await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habitsPage }])
      await page.goto(`/?date=${today}`)
      await openTodayListOptions(page, ptBr.habits.listOptions)
      await page.getByRole('menuitem', { name: ptBr.habits.refresh }).click()
      await expect(page.locator('[data-habit-title="Beber água"]')).toBeVisible()
      await expect(page.getByRole('menu', { name: ptBr.habits.listOptions })).toHaveCount(0)
      await expect(page.locator('.orbit-sheet-backdrop')).toHaveCount(0)
      await expectCompactFabNoticeGeometry(page, ptBr.celebration.close)
    })
  })
}

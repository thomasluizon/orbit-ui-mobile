import { readExpandedControlGeometry } from './expanded-control-geometry'
import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

const habit = habitDetailSchema.parse({ ...makeHabitDetail(), dueTime: '21:00:00' })
const schedule = makeHabitScheduleItem({ id: habit.id, title: habit.title, dueTime: habit.dueTime })
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', uses24HourClock: true })
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

for (const width of [412, 1280]) {
  test.describe(`habit detail exact time at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 }, timezoneId: 'UTC' })

    test('shows minutes and opens the picker at the stored time', async ({ page, context }) => {
      await page.clock.setFixedTime(new Date('2026-08-28T09:15:00Z'))
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: habits }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))

      await page.goto(`/habits/${habit.id}`)
      const title = page.locator('[data-habit-detail-content] h1 > button')
      await expect(title).toHaveText(habit.title)
      const hit = await title.evaluate(readExpandedControlGeometry)
      expect(hit.height).toBeGreaterThanOrEqual(48)
      expect(hit.edgeHits).toEqual([true, true, true, true])
      await page.getByRole('button', { name: ptBr.habits.detail.moreDetails, exact: true }).click()
      await expect(page.getByRole('textbox', { name: ptBr.habits.form.exactTime, exact: true })).toHaveValue('21:00')
      await page.getByRole('button', { name: `${ptBr.habits.form.exactTime}: ${ptBr.common.selectTime}`, exact: true }).click()
      const picker = page.getByRole('dialog', { name: ptBr.common.selectTime })
      await expect(picker.getByRole('radiogroup', { name: ptBr.common.hours }).getByRole('radio', { name: '21', exact: true })).toHaveAttribute('aria-checked', 'true')
      await expect(picker.getByRole('radiogroup', { name: ptBr.common.minutes }).getByRole('radio', { name: '00', exact: true })).toHaveAttribute('aria-checked', 'true')
    })
  })
}

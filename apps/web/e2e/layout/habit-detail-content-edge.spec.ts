import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

const habitId = 'habit-1'
const habit = habitDetailSchema.parse(makeHabitDetail())
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [makeHabitScheduleItem()], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})
const metrics = habitMetricsSchema.parse({
  currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100,
  totalCompletions: 1, lastCompletedDate: null,
})

for (const width of [412, 840, 1100, 1352]) {
  test.describe(`habit detail content edge at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const locale of ['pt-BR', 'en']) {
      test(`aligns the capped body with the back control in ${locale}`, async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language: locale }) }])
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))

        await page.goto(`/habits/${habitId}`)
        const content = page.locator('[data-habit-detail-content]')
        const title = content.locator('h1')
        const back = page.locator('header[data-back] button').first()
        await expect(title).toHaveText(habit.title)
        await expect(back).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const titleLeft = await title.evaluate((element) => element.getBoundingClientRect().left)
        const backLeft = await back.evaluate((element) => element.getBoundingClientRect().left)
        const contentWidth = await content.evaluate((element) => {
          const style = getComputedStyle(element)
          return element.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
        })
        expect(Math.abs(titleLeft - backLeft)).toBeLessThanOrEqual(0.5)
        expect(contentWidth).toBeGreaterThan(0)
        expect(contentWidth).toBeLessThanOrEqual(620)
      })
    }
  })
}

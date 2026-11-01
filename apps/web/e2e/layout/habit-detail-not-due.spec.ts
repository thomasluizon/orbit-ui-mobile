import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitDetail, makeMonthlyChildDaySchedule } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './layout-test'

const date = '2026-11-01'

for (const width of [320, 412, 1352]) {
  for (const mode of ['light', 'dark'] as const) {
    for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
      test.describe(`Not-due detail children at ${width}px in ${locale} ${mode}`, () => {
        test.use({ viewport: { width, height: 915 }, colorScheme: mode })

        test('keeps skipped and unscheduled metadata inside their rows at large text', async ({ page, context }) => {
          const schedule = makeMonthlyChildDaySchedule()
          const skipped = schedule.children[0]!
          schedule.children.push({ ...skipped, id: 'child-3', title: 'Next month', isSkippedOnDate: false })
          const detail = habitDetailSchema.parse({ ...makeHabitDetail(), frequencyUnit: 'Month', days: [], children: schedule.children })
          const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 100, totalCount: 1, totalPages: 1 })
          const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: mode })
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }, { path: API.habits.list, body: habits }])
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(detail.id)}`, (route) => route.fulfill({ json: detail }))
          await page.goto(`/habits/${detail.id}?date=${date}`)
          const group = page.getByTestId('detail-children')
          await expect(group.getByTestId('habit-row')).toHaveCount(3)
          for (const scale of [1, 2]) {
            await page.evaluate((textScale) => { document.documentElement.style.fontSize = `${16 * textScale}px` }, scale)
            await page.evaluate(() => document.fonts.ready)
            for (const [id, reason] of [['child-1', messages.habits.statusDot.skip], ['child-3', messages.calendar.dayCell.notScheduled]] as const) {
              const row = group.locator(`[data-habit-id="${id}"]`)
              const meta = row.locator('[data-habit-row-meta]')
              await expect(meta.getByText(reason, { exact: true })).toBeVisible()
              await expect(row.locator('[data-habit-check]')).toHaveAttribute('data-status', 'unavailable')
              await expect(row.getByTestId('habit-status-toggle')).toHaveAttribute('aria-disabled', 'true')
              const bounds = await row.evaluate((element) => {
                const card = element.getBoundingClientRect()
                return [...element.querySelectorAll('[data-habit-row-meta] [data-habit-row-meta-token]')].map((token) => {
                  const box = token.getBoundingClientRect()
                  return { left: box.left - card.left, right: card.right - box.right, bottom: card.bottom - box.bottom }
                })
              })
              expect(bounds.length).toBeGreaterThan(0)
              for (const token of bounds) {
                expect(token.left).toBeGreaterThanOrEqual(0)
                expect(token.right).toBeGreaterThanOrEqual(0)
                expect(token.bottom).toBeGreaterThanOrEqual(0)
              }
            }
            await expect(group.locator('[data-habit-id="child-2"] [data-habit-check]')).toHaveAttribute('data-status', 'done')
          }
        })
      })
    }
  }
}

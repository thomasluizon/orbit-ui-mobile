import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

const habitId = 'habit-1'
const metrics = habitMetricsSchema.parse({ currentStreak: 2, longestStreak: 4, weeklyCompletionRate: 80, monthlyCompletionRate: 74.6, totalCompletions: 2, lastCompletedDate: null })

for (const width of [412, 1280]) {
  test.describe(`habit detail stat card at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })
    for (const language of ['en', 'pt-BR'] as const) {
      for (const isBadHabit of [false, true]) {
        test(`keeps three rows in one card in ${language} with avoid ${isBadHabit}`, async ({ page, context }) => {
          const words = language === 'pt-BR' ? ptBR : en
          const habit = habitDetailSchema.parse({ ...makeHabitDetail(), isBadHabit, children: [] })
          const schedule = makeHabitScheduleItem({ isBadHabit, children: [], hasSubHabits: false })
          const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
          await context.addCookies([{ name: 'i18n_locale', value: language, url: LAYOUT_ORIGIN }])
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language }) }])
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
          let releaseMetrics!: () => void
          const metricsReady = new Promise<void>((resolve) => { releaseMetrics = resolve })
          await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, async (route) => {
            await metricsReady
            await route.fulfill({ json: metrics })
          })
          try {
            await page.goto(`/habits/${habitId}`)
            const column = page.locator('[data-habit-detail-content]')
            const card = column.locator('[data-habit-detail-stat-card]')
            await expect(card).toHaveCount(1)
            await expect(card).toHaveAttribute('aria-busy', 'true')
            const rows = card.locator('[data-habit-detail-stat-row]')
            await expect(rows).toHaveCount(3)
            for (const row of await rows.all()) await expect(row.locator('[data-habit-detail-stat-value]')).toHaveText(words.common.loading)
            await page.evaluate(() => document.fonts.ready)
            const loadingHeight = await card.evaluate((element) => element.getBoundingClientRect().height)
            releaseMetrics()
            await expect(card).not.toHaveAttribute('aria-busy', 'true')
            await expect(rows.locator('[data-habit-detail-stat-label]')).toHaveText([
              isBadHabit ? words.habits.detail.daysFree : words.habits.detail.currentStreak,
              words.habits.detail.longestStreak,
              words.habits.detail.monthlyRate,
            ])
            await expect(rows.locator('[data-habit-detail-stat-value]')).toHaveText(['2', '4', '75%'])
            await expect(column.locator('[data-state]:has(> span[title]), [data-variant="stat-tile"]')).toHaveCount(0)
            const geometry = await card.evaluate((element) => {
              const rect = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              return {
                height: rect.height, radius: style.borderRadius, padding: style.padding,
                ring: style.boxShadow, background: style.backgroundColor,
                rows: Array.from(element.querySelectorAll('[data-habit-detail-stat-row]'), (row) => {
                  const label = row.querySelector('[data-habit-detail-stat-label]')!
                  const value = row.querySelector('[data-habit-detail-stat-value]')!
                  return { height: row.getBoundingClientRect().height, labelStart: label.getBoundingClientRect().left - rect.left, valueEnd: rect.right - value.getBoundingClientRect().right, fontSize: getComputedStyle(value).fontSize, weight: getComputedStyle(value).fontWeight, alignment: getComputedStyle(row).alignItems }
                }),
              }
            })
            expect(geometry.radius).toBe('20px')
            expect(geometry.padding).toBe('24px')
            expect(geometry.ring).toContain('inset')
            expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)')
            expect(geometry.height).toBe(loadingHeight)
            for (const row of geometry.rows) {
              expect(row.height).toBeGreaterThanOrEqual(48)
              expect(Math.abs(row.labelStart - 24)).toBeLessThanOrEqual(0.5)
              expect(Math.abs(row.valueEnd - 24)).toBeLessThanOrEqual(0.5)
              expect(row.fontSize).toBe('22px')
              expect(row.weight).toBe('600')
              expect(row.alignment).toBe('baseline')
            }
          } finally { releaseMetrics() }
        })
      }
    }
  })
}

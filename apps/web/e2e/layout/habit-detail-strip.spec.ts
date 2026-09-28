import { expect, test } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

const habitId = 'habit-1'
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title: 'Beber água', dueTime: '08:00:00' })
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

for (const width of [320, 412, 1024, 1352] as const) {
  test.describe(`habit detail strip at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    test('shows every day within the strip without horizontal overflow', async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) =>
        route.fulfill({ json: profileSchema.parse({ ...profileFixture, language: 'pt-BR' }) }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))

      await page.goto(`/habits/${habitId}`)
      const strip = page.getByRole('group', { name: ptBr.habits.detail.lastThirtyDays })
      await expect(strip).toBeVisible()
      await expect(strip.locator('[data-state]')).toHaveCount(30)
      await page.evaluate(() => document.fonts.ready)

      const geometry = await strip.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const cells = Array.from(element.querySelectorAll('[data-state]'))
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          cellWidths: cells.map((cell) => cell.getBoundingClientRect().width),
          clippedCells: cells.filter((cell) => {
            const cellBounds = cell.getBoundingClientRect()
            return cellBounds.left < bounds.left - 0.5 || cellBounds.right > bounds.right + 0.5
          }).length,
        }
      })
      expect(geometry.scrollWidth, `strip overflow at ${width}px`).toBeLessThanOrEqual(geometry.clientWidth)
      expect(geometry.cellWidths).toEqual(Array(30).fill(width >= 1024 ? 16 : 8))
      expect(geometry.clippedCells).toBe(0)
    })
  })
}

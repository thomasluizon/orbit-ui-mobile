import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ children: [], hasSubHabits: false, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] })],
  logs: {},
})

for (const width of [320, 360, 384, 412, 600]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    for (const view of ['month', 'range'] as const) {
      test.describe(`${locale} calendar ${view} figures at ${width}px`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 } })
        test.beforeEach(async ({ context }) => {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
            (route) => route.fulfill({ json: calendarMonth }))
        })

        test('keeps equal columns with start aligned values and single line captions', async ({ page }) => {
          await page.goto('/calendar')
          await page.getByRole('radio', { name: words.calendar.view[view], exact: true }).click()
          const stats = page.getByTestId('calendar-stats')
          await expect(stats).toBeVisible()
          await expect(stats.locator('[data-state="loading"]')).toHaveCount(0)
          await page.evaluate(async () => { await document.fonts.ready })
          const figures = await stats.locator('[data-state]').evaluateAll((elements) => elements.map((figure) => {
            const value = figure.children[0]!
            const caption = figure.children[1]!
            const box = figure.getBoundingClientRect()
            const valueBox = value.getBoundingClientRect()
            const captionBox = caption.getBoundingClientRect()
            const range = document.createRange()
            range.selectNodeContents(caption)
            const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
            return {
              left: box.left, right: box.right, top: box.top, width: box.width,
              valueLeft: valueBox.left, captionLeft: captionBox.left, gap: captionBox.top - valueBox.bottom,
              lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
              fits: fragments.every((rect) => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5),
            }
          }))
          expect(figures).toHaveLength(3)
          const contentLeft = await stats.evaluate((element) => element.getBoundingClientRect().left)
          expect(Math.abs(figures[0]!.left - contentLeft - 16)).toBeLessThanOrEqual(0.5)
          for (const figure of figures) {
            expect(Math.abs(figure.width - figures[0]!.width)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(figure.valueLeft - figure.left)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(figure.captionLeft - figure.left)).toBeLessThanOrEqual(0.5)
            expect(Math.abs(figure.gap - 8)).toBeLessThanOrEqual(0.5)
            expect(figure.lines).toBe(1)
            expect(figure.fits).toBe(true)
            expect(figure.top).toBe(figures[0]!.top)
          }
          for (let index = 1; index < figures.length; index++) {
            expect(Math.abs(figures[index]!.left - figures[index - 1]!.right - 16)).toBeLessThanOrEqual(0.5)
          }
        })
      })
    }
  }
}

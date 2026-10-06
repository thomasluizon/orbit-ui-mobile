import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({
  habits: ['walk', 'read'].map((id) => makeHabitScheduleItem({ id, children: [], hasSubHabits: false, dueDate: '2026-09-02', scheduledDates: ['2026-09-02', '2026-09-03', '2026-09-04'] })),
  logs: {
    walk: ['2026-09-02', '2026-09-03'].map((date) => ({ id: `walk-${date}`, date, value: 1, createdAtUtc: `${date}T12:00:00Z` })),
    read: [{ id: 'read-2026-09-02', date: '2026-09-02', value: 1, createdAtUtc: '2026-09-02T12:00:00Z' }],
  },
})

for (const width of [320, 600, 840, 1352]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} calendar grid column at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('aligns month and range tracks with the view switch', async ({ page, context }) => {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
        await page.goto('/calendar')
        const selector = page.getByTestId('calendar-header-group').getByRole('radiogroup')
        for (const view of ['month', 'range'] as const) {
          await selector.getByRole('radio', { name: words.calendar.view[view], exact: true }).click()
          const grid = page.getByTestId('month-grid-days')
          await expect(grid).toBeVisible()
          await expect(grid.locator('[data-outcome]').first()).toBeVisible()
          await page.evaluate(async () => { await document.fonts.ready })
          const edges = await grid.evaluate((grid) => {
            const bounds = grid.getBoundingClientRect()
            const selector = document.querySelector('[data-testid="calendar-header-group"] [role="radiogroup"]')!.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, switchLeft: selector.left, switchRight: selector.right }
          })
          expect(Math.abs(edges.left - edges.switchLeft), view).toBeLessThanOrEqual(0.5)
          expect(Math.abs(edges.right - edges.switchRight), view).toBeLessThanOrEqual(0.5)
          const slots = await grid.evaluate((grid) => [...grid.children].map((slot) => {
            const bounds = slot.getBoundingClientRect()
            return { width: bounds.width, height: bounds.height }
          }))
          expect(slots.length).toBeGreaterThanOrEqual(14)
          for (const slot of slots) {
            expect(slot.height).toBeGreaterThanOrEqual(44)
            expect(Math.abs(slot.width - slots[0]!.width)).toBeLessThanOrEqual(0.5)
          }
          if (view === 'month') {
            const firstDay = grid.locator('[data-calendar-date] button').first()
            await firstDay.click()
            await expect(firstDay).toHaveAttribute('aria-pressed', 'true')
            const selection = await firstDay.evaluate((button) => {
              const slot = button.parentElement!.getBoundingClientRect()
              const grid = button.closest('[data-testid="month-grid-days"]')!.getBoundingClientRect()
              return { left: slot.left, right: slot.right, gridLeft: grid.left, gridRight: grid.right }
            })
            expect(selection.left).toBeGreaterThanOrEqual(selection.gridLeft - 0.5)
            expect(selection.right).toBeLessThanOrEqual(selection.gridRight + 0.5)
          }
          if (width === 320) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        }
      })
    })
  }
}

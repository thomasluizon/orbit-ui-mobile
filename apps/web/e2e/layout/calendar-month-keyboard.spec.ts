import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ children: [], hasSubHabits: false, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] })],
  logs: {},
})
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', weekStartDay: 1 })

for (const width of [412, 1352]) {
  test.describe(`month keyboard navigation at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 }, layoutProfile: profile })
    test.beforeEach(async ({ context }) => {
      await setLayoutProfileSession(context, profile)
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
        (route) => route.fulfill({ json: calendarMonth }))
    })

    test('has one tab stop and moves focus without changing selection', async ({ page }) => {
      await page.goto('/calendar')
      const monthSegment = page.getByRole('radio', { name: ptBR.calendar.view.month, exact: true })
      await monthSegment.click()
      const grid = page.getByTestId('month-grid-days')
      const selected = grid.getByTestId('calendar-day-select-2026-09-04')
      await expect(selected).toHaveAttribute('aria-pressed', 'true')
      await monthSegment.focus()
      await page.keyboard.press('Tab')
      await expect(selected).toBeFocused()
      await page.keyboard.press('Tab')
      expect(await grid.evaluate((element) => element.contains(document.activeElement))).toBe(false)
      await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1)

      await selected.focus()
      for (const [key, date] of [
        ['ArrowRight', '2026-09-05'],
        ['ArrowDown', '2026-09-12'],
        ['Home', '2026-09-07'],
        ['End', '2026-09-13'],
      ] as const) {
        await page.keyboard.press(key)
        const focusedDay = grid.getByTestId(`calendar-day-select-${date}`)
        await expect(focusedDay).toBeFocused()
        await expect(focusedDay).toHaveAttribute('tabindex', '0')
        await expect(focusedDay).toHaveAttribute('aria-pressed', 'false')
        await expect(selected).toHaveAttribute('aria-pressed', 'true')
        await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1)
      }
    })
  })
}

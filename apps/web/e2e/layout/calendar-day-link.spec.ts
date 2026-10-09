import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { readOutlineVisibility } from './focus-indicators'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const selectedDate = '2026-09-04'
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ children: [], hasSubHabits: false, dueDate: selectedDate, scheduledDates: [selectedDate] })],
  logs: {},
})

for (const width of [412, 1280]) {
  for (const themePreference of ['light', 'dark'] as const) {
    test.describe(`pt-BR calendar day link at ${width}px in ${themePreference}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', themePreference })
      test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 }, layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('hover and press fill the rounded row with content clearance', async ({ page }) => {
        await page.goto('/calendar')
        const link = page.getByRole('link', { name: ptBR.calendar.goToDay, exact: true })
        await expect(link).toHaveAttribute('href', `/?date=${selectedDate}`)
        await expectInteractionFill(link)
        await expect(link).toHaveCSS('border-top-left-radius', '12px')
      })

      test('keyboard focus follows the row radius without clipping', async ({ page }) => {
        await page.goto('/calendar')
        const link = page.getByRole('link', { name: ptBR.calendar.goToDay, exact: true })
        await expect(link).toBeVisible()
        await link.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        await expect(link).toBeFocused()
        await expect(link).toHaveCSS('border-top-left-radius', '12px')
        const outline = await readOutlineVisibility(link)
        expect(outline.visible).toBe(true)
        expect(outline.clippedBy).toEqual([])
      })
    })
  }
}

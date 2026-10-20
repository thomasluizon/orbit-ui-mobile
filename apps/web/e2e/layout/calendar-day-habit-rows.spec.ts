import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { calendarDayCardDate, makeCalendarDayCardEntries, makeCalendarDayCardMonth } from '@orbit/shared/test-support/calendar-day-card-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { expectCalendarDayHabitRows } from './calendar-day-habit-geometry'

for (const width of [412, 1352]) {
  for (const { locale, messages } of [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const) {
    for (const loggable of [true, false]) {
      const selectedDate = loggable ? calendarDayCardDate : '2026-09-05'
      const entries = makeCalendarDayCardEntries(selectedDate)
      const month = makeCalendarDayCardMonth(selectedDate)
      const profile = profileSchema.parse({ ...profileFixture, language: locale, hasProAccess: false, hasGoogleConnection: false, themePreference: 'dark', uses24HourClock: true })
      test.describe(`Day habit rows at ${width}px in ${locale} with loggable=${loggable}`, () => {
        test.use({ viewport: { width, height: 915 }, appLocale: locale, colorScheme: 'dark', subscriptionState: 'free', layoutProfile: profile })
        test.beforeEach(async ({ context }) => {
          for (const [path, response] of [[API.profile.get, profile], [API.habits.calendarMonth, month]] as const) {
            await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
          }
        })

        test('keeps the drawn floor and metadata for parents and children at large text', async ({ page }) => {
          await page.goto('/calendar')
          await page.getByTestId(`calendar-day-select-${selectedDate}`).click()
          const label = page.getByRole('button', { name: loggable ? 'Caminhar' : /^Caminhar,/, exact: loggable })
          await expect(label).toBeVisible()
          const card = label.locator('xpath=ancestor::section[1]')
          await expect(card.locator('[data-personal-text]')).toHaveCount(entries.length)
          await expect(card.getByRole('checkbox')).toHaveCount(loggable ? entries.length : 0)
          await page.evaluate(async () => { await document.fonts.ready })
          const heights: number[][] = []
          for (const scale of [1, 2]) {
            heights.push(await expectCalendarDayHabitRows(card, entries, messages.calendar.timeGrid.noSetTime, scale))
          }
          for (const index of [0, 1, 3, 4]) {
            expect(heights[0]![index]).toBeCloseTo(68)
            expect(heights[1]![index]).toBeGreaterThan(heights[0]![index]!)
          }
        })
      })
    }
  }
}

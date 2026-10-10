import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const dates = Array.from({ length: 7 }, (_, index) => `2026-10-${String(5 + index).padStart(2, '0')}`)
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [null, null, null, '08:00', '21:00'].map((dueTime, index) => makeHabitScheduleItem({
    id: `label-fit-${index}`, title: `Organizar as anotações e preparar a semana ${index}`, dueTime,
    children: [], hasSubHabits: false, dueDate: dates[0]!, scheduledDates: dates,
  })), logs: {},
})

for (const width of [320, 412, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} calendar any-time label at ${width}px`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, timeZone: 'UTC', weekStartDay: 1 })
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profile })
      test.beforeEach(async ({ context, page }) => {
        await setLayoutProfileSession(context, profile)
        await page.clock.setFixedTime(new Date('2026-10-08T12:00:00Z'))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('keeps the Semana gutter label on one whole line', async ({ page }) => {
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.week, exact: true }).click()
        await expect(page.getByTestId('time-grid-event')).toHaveCount(14)
        const label = page.getByTestId('time-grid-any-time-label')
        await page.getByTestId('time-grid-hour-scroller').evaluate((element) => { element.scrollTop = 0 })
        await expect(label).toHaveText(words.calendar.timeGrid.noSetTime)
        await markRequiredLabels(label)
        await expectLabelsFit(page, label.locator('..'))
        expect(await label.evaluate((element) => element.parentElement!.getBoundingClientRect().width)).toBe(96)
      })
    })
  }
}

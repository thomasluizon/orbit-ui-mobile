import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { profileSchema } from '@orbit/shared/types/profile'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const selectedDate = '2026-09-04'
const month = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ title: 'Ler', children: [], hasSubHabits: false, dueDate: selectedDate, dueTime: '08:00', scheduledDates: [selectedDate] })],
  logs: {},
})
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', weekStartDay: 1, hasProAccess: true, hasGoogleConnection: true, uses24HourClock: true })

for (const width of [320, 412, 840]) {
  test.describe(`Calendar month loading at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 }, layoutProfile: profile, subscriptionState: 'trial', layoutCalendars: [] })

    test('keeps the grid, first element below it and figures stationary when the month lands', async ({ page, context }) => {
      let releaseMonth = () => {}
      let markMonthRequested = () => {}
      const pendingMonth = new Promise<void>((resolve) => { releaseMonth = resolve })
      const monthRequested = new Promise<void>((resolve) => { markMonthRequested = resolve })
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, async (route) => {
        markMonthRequested()
        await pendingMonth
        await route.fulfill({ json: month })
      })
      const responses: ReadonlyArray<readonly [string, unknown]> = [
        [API.profile.get, profile], [API.calendar.events, calendarEventsResponseSchema.parse([])],
        [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
      ]
      for (const [path, response] of responses) {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
      }
      const measure = () => page.evaluate(() => {
        const grid = document.querySelector('[data-testid="calendar-grid-card"]')!.getBoundingClientRect()
        const day = document.querySelector('[data-testid="calendar-day-card-slot"]')!
        return { gridTop: grid.top, gridHeight: grid.height, dayTop: day.getBoundingClientRect().top,
          dayHeight: day.firstElementChild!.getBoundingClientRect().height,
          figuresTop: document.querySelector('[data-testid="calendar-stats"]')!.getBoundingClientRect().top }
      })
      try {
        const eventsResponse = page.waitForResponse((response) => new URL(response.url()).pathname === API.calendar.events)
        await page.goto('/calendar')
        await monthRequested
        await (await eventsResponse).finished()
        await page.getByRole('radio', { name: ptBR.calendar.view.month, exact: true }).click()
        await expect(page.getByTestId('calendar-grid-card').getByRole('progressbar')).toBeVisible()
        await expect(page.getByTestId('calendar-day-card-slot')).toBeVisible()
        await page.evaluate(async () => { await document.fonts.ready })
        const loading = await measure()
        expect(loading.gridHeight).toBeGreaterThan(0)
        const monthResponse = page.waitForResponse((response) => new URL(response.url()).pathname === API.habits.calendarMonth)
        releaseMonth()
        await monthResponse
        await expect(page.getByTestId('calendar-day-skeleton')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Ler', exact: true }).first()).toBeVisible()
        await expect(page.getByTestId('calendar-grid-card').getByRole('progressbar')).toHaveCount(0)
        await expect(page.getByTestId('calendar-stats').locator('[data-state="loading"]')).toHaveCount(0)
        expect(await measure()).toEqual(loading)
      } finally { releaseMonth() }
    })
  })
}

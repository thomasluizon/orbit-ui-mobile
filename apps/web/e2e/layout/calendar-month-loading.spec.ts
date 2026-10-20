import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { measureCalendarMonth } from './calendar-month-geometry'

const selectedDate = '2026-09-04'
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', weekStartDay: 1, hasProAccess: true, hasGoogleConnection: true, uses24HourClock: true })

for (const { width, slow, count, locale } of [412, 1352].flatMap((width) => [1, 2, 4].flatMap((count) => ['en', 'pt-BR'].flatMap((locale) => [false, true].map((slow) => ({ width, slow, count, locale }))))).concat([320, 840].flatMap((width) => [false, true].map((slow) => ({ width, slow, count: 1, locale: 'pt-BR' }))))) {
  const messages = locale === 'en' ? en : ptBR
  const localizedProfile = profileSchema.parse({ ...profile, language: locale })
  const month = calendarMonthResponseSchema.parse({
    habits: Array.from({ length: count }, (_, index) => makeHabitScheduleItem({ id: `habit-${index}`, title: index === 0 ? 'Ler' : index === 3 ? 'Caminhar pelo bairro depois do trabalho e conversar com amigos' : `Habit ${index}`, children: [], hasSubHabits: false, dueDate: selectedDate, dueTime: '08:00', scheduledDates: [selectedDate] })),
    logs: {},
  })
  test.describe(`Calendar month loading ${count} habits in ${locale} at ${width}px${slow ? ' with slow CPU and delayed events' : ''}`, () => {
    test.use({ appLocale: locale === 'en' ? 'en' : 'pt-BR', viewport: { width, height: 915 }, layoutProfile: localizedProfile, subscriptionState: 'trial', layoutCalendars: [] })

    test('keeps the grid, first element below it and figures stationary when the month lands', async ({ page, context }) => {
      let releaseMonth = () => {}
      let markMonthRequested = () => {}
      const pendingMonth = new Promise<void>((resolve) => { releaseMonth = resolve })
      const monthRequested = new Promise<void>((resolve) => { markMonthRequested = resolve })
      let releaseEvents = () => {}
      const pendingEvents = new Promise<void>((resolve) => { releaseEvents = resolve })
      if (!slow) releaseEvents()
      if (slow) {
        const session = await context.newCDPSession(page)
        await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
      }
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, async (route) => {
        markMonthRequested()
        await pendingMonth
        await route.fulfill({ json: month })
      })
      const responses: ReadonlyArray<readonly [string, unknown]> = [
        [API.profile.get, localizedProfile], [API.calendar.events, calendarEventsResponseSchema.parse([])],
        [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
      ]
      for (const [path, response] of responses) {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, async (route) => {
          if (path === API.calendar.events) await pendingEvents
          await route.fulfill({ json: response })
        })
      }
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: createPaginatedSchema(habitScheduleItemSchema).parse({ items: month.habits, page: 1, pageSize: 50, totalCount: month.habits.length, totalPages: 1 }) }))
      const measure = () => measureCalendarMonth(page, messages.calendar.dayDetail.noEventsToImport)
      try {
        const eventsResponse = page.waitForResponse((response) => new URL(response.url()).pathname === API.calendar.events)
        await page.goto('/')
        await expect(page.getByRole('button', { name: 'Ler', exact: true }).first()).toBeVisible()
        await page.locator('a[href="/calendar"]').first().click()
        await monthRequested
        await page.getByRole('radio', { name: messages.calendar.view.month, exact: true }).click()
        await expect(page.getByTestId('calendar-grid-card').getByRole('progressbar')).toBeVisible()
        await expect(page.getByTestId('calendar-day-card-slot')).toBeVisible()
        if (slow) await expect(page.getByTestId('calendar-day-card-slot').getByRole('progressbar', { name: messages.calendar.fetchingEvents })).toBeVisible()
        releaseEvents()
        await (await eventsResponse).finished()
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
      } finally { releaseMonth(); releaseEvents() }
    })
  })
}

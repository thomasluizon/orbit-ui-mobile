import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const calendars = userCalendarsSchema.parse([
  { id: 'family', name: 'Família', accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true },
])
const events = calendarEventsResponseSchema.parse([
  createMockCalendarSyncEvent({ id: 'plain', title: 'Caminhar', calendarName: '', description: null, startDate: '2026-10-16', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
  createMockCalendarSyncEvent({ id: 'selected', title: 'Ler', calendarName: '', description: null, startDate: '2026-10-16', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
  createMockCalendarSyncEvent({ id: 'blocked', title: 'Planejar', calendarName: '', description: null, startDate: '2026-10-16', startTime: null, endTime: null, isRecurring: true, recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=2MO', reminders: [] }),
])
for (const width of [412, 1352]) {
  for (const colorScheme of ['dark', 'light'] as const) {
    test.describe(`Calendars event rows at ${width}px in ${colorScheme}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', plan: 'pro', hasProAccess: true, hasGoogleConnection: true, themePreference: colorScheme })
      test.use({ viewport: { width, height: 915 }, colorScheme, appLocale: 'pt-BR', subscriptionState: 'trial', layoutProfile: profile, layoutCalendars: calendars })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile, calendars)
        const responses: ReadonlyArray<readonly [string, unknown]> = [
          [API.calendar.events, events],
          [API.calendar.calendars, calendars],
          [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
          [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: [], logs: {} })],
        ]
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        for (const [path, response] of responses) {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
        }
      })

      test('omits row and list rules and clips state fills to the row radius', async ({ page }) => {
        await page.goto('/calendar?import=1')
        const sheet = page.getByRole('dialog', { name: ptBR.calendar.calendars.title, exact: true })
        const plain = sheet.getByRole('button', { name: /^Caminhar/ })
        const selected = sheet.getByRole('button', { name: /^Ler/ })
        const blocked = sheet.getByRole('button', { name: /^Planejar/ })
        await expect(plain).toHaveAttribute('aria-pressed', 'true')
        await plain.click()
        await expect(plain).toHaveAttribute('aria-pressed', 'false')
        await expect(selected).toHaveAttribute('aria-pressed', 'true')
        await expect(blocked).toBeDisabled()
        await expect(blocked).toHaveAttribute('aria-pressed', 'false')
        await expect(blocked).toHaveAccessibleDescription(ptBR.calendar.importIssue.ordinalWeekday)
        const rows = [plain, selected, blocked].map((button) => button.locator('..'))
        const list = rows[0]!.locator('..')
        for (const surface of [...rows, list]) {
          await expect(surface).toHaveCSS('border-bottom-width', '0px')
          await expect(surface).toHaveCSS('box-shadow', 'none')
        }
        for (const row of rows.slice(1)) {
          await expect(row).toHaveCSS('border-radius', '12px')
          await expect(row).toHaveCSS('overflow-x', 'hidden')
          await expect(row).toHaveCSS('overflow-y', 'hidden')
          expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
        }
        await page.keyboard.press('Tab')
        await selected.focus()
        await expect(selected).toBeFocused()
        await expect(selected).toHaveCSS('outline-style', 'solid')
        await expect(selected).toHaveCSS('outline-width', '2px')
        await expect(selected).toHaveCSS('outline-offset', '-4px')
        const details = rows[2]!.getByRole('button', { name: ptBR.contextMenu.viewDetails, exact: true })
        await details.focus()
        await expect(details).toBeFocused()
        await expect(details).toHaveCSS('outline-offset', '-4px')
      })
    })
  }
}

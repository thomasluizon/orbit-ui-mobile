import { settleAnimations } from './settle-animations'
import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const calendars = userCalendarsSchema.parse([
  { id: 'family', name: 'Calendário compartilhado dos compromissos e encontros de toda a minha família', accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true },
])
const events = calendarEventsResponseSchema.parse([
  createMockCalendarSyncEvent({ id: 'walk', title: 'Caminhar', calendarName: '', startDate: '2026-10-16', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
  createMockCalendarSyncEvent({ id: 'read', title: 'Ler', calendarName: '', startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
])

async function expectHeadingAlignment(row: Locator) {
  await expect(row.getByRole('button')).toBeEnabled()
  const geometry = await row.evaluate((element) => {
    const heading = element.querySelector('h2')!
    const toggle = element.querySelector('button')!.getBoundingClientRect()
    const body = element.closest<HTMLElement>('[data-slot="sheet-body"]')!
    const range = document.createRange()
    range.selectNodeContents(heading)
    const first = [...range.getClientRects()].find((rect) => rect.width > 0)!
    const style = getComputedStyle(body)
    const bounds = body.getBoundingClientRect()
    return {
      lineCentre: first.top + first.height / 2,
      lineLeft: heading.getBoundingClientRect().left,
      toggleCentre: toggle.top + toggle.height / 2,
      toggleRight: toggle.right,
      start: bounds.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
      end: bounds.left + body.clientLeft + body.clientWidth - Number.parseFloat(style.paddingRight),
    }
  })
  expect(Math.abs(geometry.toggleCentre - geometry.lineCentre)).toBeLessThanOrEqual(2)
  expect(Math.abs(geometry.toggleRight - geometry.end)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.lineLeft - geometry.start)).toBeLessThanOrEqual(1)
}

async function doubleSheetText(sheet: Locator) {
  await sheet.evaluate((surface) => {
    const measurements = [surface, ...surface.querySelectorAll<HTMLElement>('*')]
      .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize), line: Number.parseFloat(getComputedStyle(element).lineHeight) }))
    for (const { element, size, line } of measurements) {
      element.style.fontSize = `${size * 2}px`
      if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px`
    }
  })
  await sheet.evaluate(settleAnimations)
}

for (const width of [320, 412, 1352]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    test.describe(`Calendars select all at ${width}px in ${locale}`, () => {
      const words = locale === 'pt-BR' ? ptBR : en
      const profile = profileSchema.parse({ ...profileFixture, language: locale, plan: 'pro', hasProAccess: true, hasGoogleConnection: true })
      test.use({ viewport: { width, height: 915 }, appLocale: locale, subscriptionState: 'trial', layoutProfile: profile, layoutCalendars: calendars })
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

      for (const count of [2, 20, 100]) {
        test(`keeps select all on the first heading line with ${count} events at default and enlarged text sizes`, async ({ context, page }) => {
          const countedEvents = calendarEventsResponseSchema.parse(Array.from({ length: count }, (_, index) => ({ ...events[index % events.length]!, id: `event-${index}` })))
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.calendar.events, (route) => route.fulfill({ json: countedEvents }))
          await page.goto('/calendar?import=1')
          const sheet = page.getByRole('dialog', { name: words.calendar.calendars.title, exact: true })
          const row = sheet.getByTestId('section-heading-row')
          await expect(row.getByRole('heading')).toHaveText(`${count} ${locale === 'pt-BR' ? 'eventos' : 'events'}`)
          await expect(row.getByRole('button', { name: words.calendar.deselectAll, exact: true })).toBeVisible()
          await expectHeadingAlignment(row)
          expect(await row.getByRole('heading').evaluate((element) => element.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(element).lineHeight))).toBeCloseTo(1, 1)
          await doubleSheetText(sheet)
          await expectHeadingAlignment(row)
        })
      }

      test('omits select all when every event has an import issue', async ({ context, page }) => {
        const blocked = calendarEventsResponseSchema.parse(events.map((event) => ({ ...event, isRecurring: true, recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=2MO' })))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.calendar.events, (route) => route.fulfill({ json: blocked }))
        await page.goto('/calendar?import=1')
        const sheet = page.getByRole('dialog', { name: words.calendar.calendars.title, exact: true })
        const row = sheet.getByTestId('section-heading-row')
        await expect(row.getByRole('heading')).toBeVisible()
        await expect(sheet.getByRole('button', { name: words.calendar.selectAll, exact: true })).toHaveCount(0)
        await expect(sheet.getByRole('button', { name: words.calendar.deselectAll, exact: true })).toHaveCount(0)
        await expect(row.locator('button:disabled')).toHaveCount(0)
        await expect(sheet.getByText(words.calendar.importIssue.ordinalWeekday, { exact: true })).toHaveCount(2)
      })
    })
  }
}

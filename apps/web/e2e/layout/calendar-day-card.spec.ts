import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const habitTitle = 'Caminhar pelo bairro depois do trabalho e conversar com os amigos sobre os planos para a semana e os caminhos que queremos conhecer juntos'
const selectedDate = '2026-09-04'
const month = calendarMonthResponseSchema.parse({
  habits: [habitTitle, 'Ler'].map((title, index) => makeHabitScheduleItem({
    id: `habit-${index}`, title, children: [], hasSubHabits: false,
    dueDate: selectedDate, dueTime: '08:00', scheduledDates: [selectedDate],
  })),
  logs: {},
})
const calendars = userCalendarsSchema.parse([
  { id: 'work', name: 'Trabalho', accessRole: 'owner', primary: true, backgroundColor: null, isSynced: true },
])
const events = calendarEventsResponseSchema.parse(Array.from({ length: 4 }, (_, index) => createMockCalendarSyncEvent({
  id: `event-${index}`, title: `Encontro ${index}`, startDate: selectedDate, startTime: '09:00', calendarName: 'Trabalho',
})))
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', hasProAccess: true, hasGoogleConnection: true, themePreference: 'dark', uses24HourClock: true })

for (const width of [320, 412, 1280]) {
  test.describe(`Calendar day card at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 }, appLocale: 'pt-BR', colorScheme: 'dark', subscriptionState: 'trial', layoutProfile: profile, layoutCalendars: calendars })
    test.beforeEach(async ({ context }) => {
      await setLayoutProfileSession(context, profile, calendars)
      const responses: ReadonlyArray<readonly [string, unknown]> = [
        [API.profile.get, profile], [API.habits.calendarMonth, month],
        [API.calendar.calendars, calendars], [API.calendar.events, events],
        [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
      ]
      for (const [path, response] of responses) {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
      }
    })

    test('uses the drawn content edge, group rhythm and label target', async ({ page }) => {
      await page.goto('/calendar')
      const label = page.getByRole('button', { name: habitTitle, exact: true })
      await expect(label).toBeVisible()
      const card = label.locator('xpath=ancestor::section[1]')
      await expect(card.getByRole('button', { name: ptBR.calendar.dayDetail.viewAllEvents.replace('{count}', '4'), exact: true })).toBeVisible()
      await page.evaluate(async () => { await document.fonts.ready })
      const geometry = await card.evaluate((element, habitTitle) => {
        const bounds = element.getBoundingClientRect()
        const groups = [...element.firstElementChild!.children] as HTMLElement[]
        const title = element.querySelector('h2')!
        const summary = title.nextElementSibling!
        const summaryStyle = getComputedStyle(summary)
        const label = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === habitTitle && button.getAttribute('role') !== 'checkbox')!
        const rows = [...groups[1]!.children] as HTMLElement[]
        const eventRows = [...groups.at(-1)!.querySelectorAll<HTMLElement>('button[data-all-day], button[aria-label^="09:00,"]')]
        const labelStyle = getComputedStyle(label)
        const headline = label.querySelector<HTMLElement>('[data-personal-text]')!
        const headlineStyle = getComputedStyle(headline)
        const muted = document.createElement('span')
        muted.style.color = 'var(--fg-3)'
        element.append(muted)
        const mutedColor = getComputedStyle(muted).color
        muted.remove()
        const fills = [...rows, ...element.querySelectorAll<HTMLElement>('a, button:not([role="checkbox"])')].filter((target) => !target.parentElement?.parentElement?.isSameNode(groups[1]!))
        return {
          titleInsets: [title.getBoundingClientRect().left - bounds.left, title.getBoundingClientRect().top - bounds.top],
          summaryGap: summary.getBoundingClientRect().top - title.getBoundingClientRect().bottom,
          summaryFont: summaryStyle.fontFamily, summarySize: Number.parseFloat(summaryStyle.fontSize), summaryColor: summaryStyle.color,
          mutedColor,
          groupGaps: groups.slice(1).map((group, index) => group.getBoundingClientRect().top - groups[index]!.getBoundingClientRect().bottom),
          bottomInset: bounds.bottom - groups.at(-1)!.getBoundingClientRect().bottom,
          fillInsets: fills.map((fill) => { const box = fill.getBoundingClientRect(); return [box.left - bounds.left, bounds.right - box.right] }),
          dayGap: rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().bottom,
          eventGaps: eventRows.slice(1).map((row, index) => row.getBoundingClientRect().top - eventRows[index]!.getBoundingClientRect().bottom),
          labelHeight: label.getBoundingClientRect().height, labelMinimum: Number.parseFloat(labelStyle.minHeight),
          labelPadding: [labelStyle.paddingTop, labelStyle.paddingBottom, labelStyle.paddingLeft, labelStyle.paddingRight],
          headlineLines: headline.getBoundingClientRect().height / Number.parseFloat(headlineStyle.lineHeight),
        }
      }, habitTitle)
      expect(geometry.titleInsets).toEqual([24, 24])
      expect(geometry.summaryGap).toBeCloseTo(4)
      expect(geometry.summaryFont).toMatch(/Geist.?Mono/i)
      expect(geometry.summarySize).toBe(12)
      expect(geometry.summaryColor).toBe(geometry.mutedColor)
      expect(geometry.bottomInset).toBeCloseTo(24)
      expect(geometry.groupGaps).toEqual([16, 16, 16])
      for (const insets of geometry.fillInsets) expect(insets).toEqual([24, 24])
      expect(geometry.dayGap).toBeCloseTo(0)
      expect(geometry.eventGaps).toEqual([4, 4])
      expect(geometry.labelHeight).toBeGreaterThanOrEqual(68)
      expect(geometry.labelMinimum).toBeGreaterThanOrEqual(68)
      expect(geometry.labelPadding).toEqual(['12px', '12px', '16px', '16px'])
      expect(geometry.headlineLines).toBeCloseTo(2)
    })
  })
}

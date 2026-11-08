import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent, createMockNotification } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { checklistTemplateSchema } from '@orbit/shared/types/checklist-template'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

function readSurfaceFill(surface: Element) {
  const probe = document.createElement('span')
  probe.style.backgroundColor = 'var(--bg-hover)'
  surface.append(probe)
  const hover = getComputedStyle(probe).backgroundColor
  probe.remove()
  return { fill: getComputedStyle(surface, '::before').backgroundColor, hover }
}

function readOwnPaint(control: Element) {
  const probe = document.createElement('span')
  probe.style.backgroundColor = 'var(--bg-hover)'
  control.append(probe)
  const hover = getComputedStyle(probe).backgroundColor
  probe.remove()
  return [getComputedStyle(control).backgroundColor, getComputedStyle(control, '::before').backgroundColor].includes(hover)
}

async function expectInnermostFill(page: Page, surface: Locator, body: Locator, nested: Locator) {
  await page.mouse.move(0, 0)
  await expect.poll(async () => (await surface.evaluate(readSurfaceFill)).fill).toBe('rgba(0, 0, 0, 0)')
  const resting = (await surface.evaluate(readSurfaceFill)).fill
  await nested.hover()
  await expect.poll(() => nested.evaluate(readOwnPaint), 'nested control paints the visible neutral hover fill').toBe(true)
  await expect.poll(async () => (await surface.evaluate(readSurfaceFill)).fill, 'surface fill while the nested control is hovered').toBe(resting)
  await page.mouse.down()
  await expect.poll(() => nested.evaluate(readOwnPaint), 'nested control paints the visible neutral press fill').toBe(true)
  await expect.poll(async () => (await surface.evaluate(readSurfaceFill)).fill, 'surface fill while the nested control is pressed').toBe(resting)
  await page.mouse.move(0, 0)
  await page.mouse.up()
  await nested.hover()
  await body.hover()
  await expect.poll(async () => {
    const measured = await surface.evaluate(readSurfaceFill)
    return measured.fill === measured.hover
  }, 'surface fill returns when the pointer moves from the nested control to the body').toBe(true)
  await page.mouse.move(0, 0)
}

function surfaceOf(control: Locator) {
  return control.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " orbit-list-action-surface ") or contains(concat(" ", normalize-space(@class), " "), " orbit-notification-surface ")][1]')
}

const calendars = userCalendarsSchema.parse([
  { id: 'family', name: 'Family', accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true },
])
const events = calendarEventsResponseSchema.parse([
  createMockCalendarSyncEvent({ id: 'walk', title: 'Walk', calendarName: '', description: 'Around the park before breakfast.', startDate: '2026-10-16', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }),
])

for (const width of [412, 1352]) {
  for (const colorScheme of ['dark', 'light'] as const) {
    test.describe(`One active fill under a nested control at ${width}px in ${colorScheme}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: 'en', plan: 'pro', hasProAccess: true, hasGoogleConnection: true, themePreference: colorScheme })
      test.use({ viewport: { width, height: 915 }, colorScheme, appLocale: 'en', subscriptionState: 'trial', layoutProfile: profile, layoutCalendars: calendars })

      test('keeps the Avisos row at rest while delete is under the pointer', async ({ page, context }) => {
        const notifications = notificationsResponseSchema.parse({
          items: [false, true].map((isRead) => createMockNotification({ id: `nested-${isRead}`, isRead })),
          unreadCount: 1,
        })
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }, { path: API.notifications.list, body: notifications }])
        await page.goto('/notifications')
        const rows = page.locator('li[data-read]')
        await expect(rows).toHaveCount(2)
        for (const row of await rows.all()) {
          const [body, remove] = [row.getByRole('button').first(), row.getByRole('button').last()]
          await expectInnermostFill(page, surfaceOf(body), body, remove)
        }
      })

      test('keeps the checklist template row at rest while delete is under the pointer', async ({ page, context }) => {
        const templates = [checklistTemplateSchema.parse({ id: 'workout', name: 'Workout', items: ['Run', 'Stretch'] })]
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }, { path: API.checklistTemplates.list, body: templates }])
        await page.goto('/habits/new')
        const screen = page.locator('[data-habit-create-screen]')
        await expect(screen).toBeVisible()
        await screen.getByRole('button', { name: en.habits.form.moreDetails }).click()
        await screen.locator('.habit-form-disclosure[data-open="true"]').getByRole('button', { name: en.habits.form.useTemplate }).click()
        const sheet = page.getByRole('dialog', { name: en.habits.form.templates, exact: true })
        const body = sheet.getByRole('button', { name: 'Workout', exact: true })
        const remove = sheet.getByRole('button', { name: `${en.common.delete}: Workout`, exact: true })
        await expect(remove).toBeVisible()
        await expectInnermostFill(page, surfaceOf(body), body, remove)
      })

      test('keeps the calendar import event row at rest while its detail action is under the pointer', async ({ page, context }) => {
        await setLayoutProfileSession(context, profile, calendars)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        const responses: ReadonlyArray<readonly [string, unknown]> = [
          [API.calendar.events, events],
          [API.calendar.calendars, calendars],
          [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
          [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: [], logs: {} })],
        ]
        for (const [path, response] of responses) {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
        }
        await page.goto('/calendar?import=1')
        const sheet = page.getByRole('dialog', { name: en.calendar.calendars.title, exact: true })
        const body = sheet.getByRole('button', { name: /^Walk/ })
        await expect(body).toBeVisible()
        const surface = surfaceOf(body)
        const details = surface.getByRole('button', { name: en.contextMenu.viewDetails, exact: true })
        await expectInnermostFill(page, surface, body, details)
      })
    })
  }
}

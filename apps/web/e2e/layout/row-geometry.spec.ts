import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema, userCalendarsSchema } from '@orbit/shared/types/calendar'
import { bulkCreateResponseSchema, calendarMonthResponseSchema, habitDetailSchema, habitMetricsSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const date = '2026-09-04'
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), isBadHabit: true })
const schedule = makeHabitScheduleItem({ id: habit.id, title: habit.title, dueDate: date, scheduledDates: [date], children: [], hasSubHabits: false })
const calendars = userCalendarsSchema.parse([{ id: 'family', name: 'Family calendar', accessRole: 'owner', primary: false, backgroundColor: null, isSynced: true }])
const events = calendarEventsResponseSchema.parse(['Walk', 'Read'].map((title, index) => createMockCalendarSyncEvent({ id: `event-${index}`, title, calendarName: '', startDate: date, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] })))
const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })

async function assertRow(row: Locator) {
  await row.scrollIntoViewIfNeeded()
  const geometry = await row.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('[data-slot="list-row-body"]')!
    const title = element.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
    const description = element.querySelector<HTMLElement>('[data-slot="list-row-description"]')
    const content = element.querySelector<HTMLElement>('[data-slot="list-row-content"]')!
    const first = element.querySelector('[data-slot="list-row-icon"]') ?? title
    const last = element.querySelector('[data-slot="list-row-chevron"]') ?? element.querySelector('[data-slot="list-row-trailing"]') ?? element.querySelector('[data-slot="list-row-value"]') ?? title
    const bounds = body.getBoundingClientRect()
    const style = getComputedStyle(body)
    return { title: title.textContent!, start: first.getBoundingClientRect().left - bounds.left, end: bounds.right - last.getBoundingClientRect().right,
      minHeight: style.minHeight, paddingStart: style.paddingBlockStart, paddingEnd: style.paddingBlockEnd, border: parseFloat(style.borderBottomWidth),
      gap: parseFloat(getComputedStyle(content).gap), descriptionGap: description ? description.getBoundingClientRect().top - title.getBoundingClientRect().bottom : null,
      chevronWidth: element.querySelector('[data-slot="list-row-chevron"]')?.getBoundingClientRect().width,
      supporting: Boolean(description) || Boolean(element.querySelector('[data-personal-text]') && element.querySelector('[data-slot="list-row-value"]')) }
  })
  expect(Math.abs(geometry.start - 16), geometry.title).toBeLessThanOrEqual(0.5)
  expect(Math.abs(geometry.end - 16), geometry.title).toBeLessThanOrEqual(0.5)
  expect(geometry).toMatchObject({ minHeight: geometry.supporting ? '68px' : '52px', paddingStart: '12px', paddingEnd: '12px', border: 0, gap: 12 })
  if (geometry.descriptionGap !== null) expect(Math.abs(geometry.descriptionGap - 4)).toBeLessThanOrEqual(0.5)
  if (geometry.chevronWidth !== undefined) expect(geometry.chevronWidth).toBe(24)
  const name = new RegExp(geometry.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const control = row.getByRole('switch', { name }).or(row.getByRole('button', { name })).or(row.getByRole('link', { name })).first()
  if (await control.count() && await control.isEnabled()) await expectInteractionFill(control)
}

async function assertPersonalCheckRow(body: Locator) {
  const geometry = await body.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const label = element.querySelector('.orbit-check-row-label')!
    const box = element.querySelector('[data-slot="checkbox-box"]')!.getBoundingClientRect()
    const style = getComputedStyle(element)
    return { start: label.getBoundingClientRect().left - bounds.left, end: bounds.right - box.right,
      minHeight: style.minHeight, paddingStart: style.paddingBlockStart, paddingEnd: style.paddingBlockEnd,
      gap: parseFloat(style.gap), textGap: parseFloat(getComputedStyle(label).gap),
      border: parseFloat(style.borderBottomWidth), supporting: label.children.length > 2 }
  })
  expect(Math.abs(geometry.start - 16)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(geometry.end - 16)).toBeLessThanOrEqual(0.5)
  expect(geometry).toMatchObject({ minHeight: geometry.supporting ? '68px' : '52px', paddingStart: '12px', paddingEnd: '12px', gap: 12, textGap: 4, border: 0 })
  for (const control of await body.getByRole('button').or(body.getByRole('checkbox')).all()) {
    if (await control.isEnabled()) await expectInteractionFill(control)
  }
}

async function assertRows(surface: Locator) {
  const rows = surface.locator('.orbit-list-row-shell')
  expect(await rows.count()).toBeGreaterThan(0)
  for (const row of await rows.all()) if (await row.isVisible()) await assertRow(row)
  for (const body of await surface.locator('[data-slot="list-row-body"]:has(> .orbit-check-row-label)').all()) {
    if (await body.isVisible()) await assertPersonalCheckRow(body)
  }
}

async function assertColumnRows(surface: Locator) {
  expect(await surface.evaluate((element) => [element, ...element.querySelectorAll('*')].filter((node) => {
    const style = getComputedStyle(node)
    return parseFloat(style.marginInlineStart) < 0 || parseFloat(style.marginInlineEnd) < 0
  }).map((node) => node.outerHTML))).toEqual([])
  for (const row of await surface.locator('.orbit-list-row-column').all()) {
    if (!await row.isVisible()) continue
    const alignment = await row.evaluate((element) => {
      const fill = element.querySelector('[data-slot="list-row-body"]')!.getBoundingClientRect()
      const content = element.getBoundingClientRect()
      const first = element.querySelector('[data-slot="list-row-icon"]') ?? element.querySelector('[data-slot="list-row-title"]')!
      return { contentStart: first.getBoundingClientRect().left - content.left, outsetStart: content.left - fill.left, outsetEnd: fill.right - content.right }
    })
    for (const [key, expected] of Object.entries({ contentStart: 0, outsetStart: 16, outsetEnd: 16 })) expect(Math.abs(alignment[key as keyof typeof alignment] - expected)).toBeLessThanOrEqual(0.5)
  }
}

for (const width of [412, 1352]) for (const locale of ['en', 'pt-BR'] as const) for (const pro of [false, true]) {
  test.describe(`row geometry at ${width}px in ${locale}, Pro ${pro}`, () => {
    const words = locale === 'en' ? en : ptBR
    const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: 'dark', plan: pro ? 'pro' : 'free', hasProAccess: pro, isTrialActive: false, hasGoogleConnection: true, marketingEmailConsent: true })
    test.use({ viewport: { width, height: 915 }, appLocale: locale, subscriptionState: pro ? 'stripe' : 'free', layoutProfile: profile, layoutCalendars: calendars })
    test.beforeEach(async ({ context }) => {
      await setLayoutProfileSession(context, profile, calendars)
      const responses: ReadonlyArray<readonly [string, unknown]> = [
        [API.profile.get, profile], [API.habits.get(habit.id), habit], [API.habits.logs(habit.id), []], [API.habits.metrics(habit.id), metrics],
        [API.habits.bulk, bulkCreateResponseSchema.parse({ results: events.map((event, index) => ({ index, status: 'Success', habitId: `imported-${index}`, title: event.title, error: null, field: null })) })], [API.calendar.events, events], [API.calendar.calendars, calendars],
        [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true })],
        [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: [schedule], logs: {} })],
      ]
      for (const [path, response] of responses) await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
    })

    test('owns geometry across forms, details, Perfil and calendar surfaces', async ({ page }) => {
      await page.goto('/habits/new')
      const form = page.locator('[data-habit-create-screen]')
      const createDisclosure = form.getByRole('button', { name: words.habits.form.moreDetails, exact: true })
      await createDisclosure.click()
      await form.getByRole('switch', { name: words.habits.form.habitTypeAvoid, exact: true }).click()
      await expect(form.getByRole('switch', { name: words.habits.form.habitTypeAvoid, exact: true })).toBeChecked()
      await assertRows(form)
      await assertColumnRows(form)
      const leadingX = await createDisclosure.locator('[data-slot="list-row-icon"]').evaluate((icon) => icon.getBoundingClientRect().left - icon.closest('.orbit-list-row-shell')!.getBoundingClientRect().left)

      await page.goto(`/habits/${habit.id}`)
      const detail = page.locator('[data-habit-detail-content]')
      const disclosure = detail.getByRole('button', { name: words.habits.detail.moreDetails, exact: true })
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      await expect(disclosure).toHaveAttribute('aria-controls', 'habit-detail-fields')
      await disclosure.click()
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
      await expect(disclosure.locator('[data-slot="list-row-chevron"]')).toHaveCount(0)
      await expect(disclosure.locator('[data-slot="list-row-title"]')).toHaveCSS('font-weight', '400')
      const glyph = disclosure.locator('[data-slot="list-row-icon"] svg')
      await expect(glyph).toHaveAttribute('width', '24')
      const detailX = await disclosure.locator('[data-slot="list-row-icon"]').evaluate((icon) => icon.getBoundingClientRect().left - icon.closest('.orbit-list-row-shell')!.getBoundingClientRect().left)
      expect(Math.abs(detailX - leadingX)).toBeLessThanOrEqual(0.5)
      const gap = await detail.locator('#habit-detail-fields').evaluate((fields) => fields.getBoundingClientRect().top - fields.previousElementSibling!.getBoundingClientRect().bottom)
      expect(Math.abs(gap - 12)).toBeLessThanOrEqual(0.5)
      await assertRows(detail)
      await assertColumnRows(detail)
      const edges = await detail.evaluate((element) => {
        const title = element.querySelector('h1 [data-personal-text]')!
        const labels = [...element.querySelectorAll('[data-slot="list-row-title"]')]
        const icons = labels.filter((label) => label.closest('.orbit-list-row-shell')!.querySelector('[data-slot="list-row-icon"]')).map((label) => label.closest('.orbit-list-row-shell')!.querySelector('[data-slot="list-row-icon"]')!.getBoundingClientRect().left)
        const date = element.querySelector('[data-slot="date-row-label"]')
        return [title.getBoundingClientRect().left, ...icons, ...(date ? [date.getBoundingClientRect().left] : [])]
      })
      expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(2)

      for (const route of ['/profile', '/profile/account', '/profile/preferences', '/profile/astra', '/profile/notifications']) {
        await page.goto(route)
        await assertRows(page.locator('#orbit-main'))
      }
      await page.goto('/calendar')
      await page.getByTestId(`calendar-day-select-${date}`).click()
      await assertRows(page.locator('#orbit-main'))
      await page.goto('/calendar?import=1')
      if (pro) {
        const sheet = page.getByRole('dialog', { name: words.calendar.calendars.title, exact: true })
        await assertRows(sheet)
        const checkbox = sheet.getByRole('checkbox', { name: 'Family calendar', exact: true })
        const label = sheet.getByRole('button', { name: 'Family calendar', exact: true })
        const inset = await checkbox.evaluate((control) => {
          const box = control.querySelector('[data-slot="checkbox-box"]')!.getBoundingClientRect()
          const body = control.closest('[data-slot="list-row-body"]')!.getBoundingClientRect()
          return body.right - box.right
        })
        expect(Math.abs(inset - 16)).toBeLessThanOrEqual(0.5)
        await expectInteractionFill(checkbox)
        await expectInteractionFill(label)
        const importText = words.calendar.importButton.split(' | ')[1]!.replace(/\{count\}/g, '2')
        await sheet.getByRole('button', { name: importText, exact: true }).click()
        await expect(sheet.getByText(words.calendar.importDone, { exact: true })).toBeVisible()
        await assertRows(sheet)
        const imported = sheet.getByRole('button', { name: 'Walk', exact: true })
        const separators = await imported.evaluate((control) => {
          const group = control.closest('.orbit-list-row-shell')!.parentElement!.parentElement!
          return [...group.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((node) => node.style.height === '1px').length
        })
        expect(separators).toBe(1)
      } else {
        await expect(page).toHaveURL(/\/calendar/)
        await expect(page.getByRole('dialog', { name: words.calendar.calendars.title, exact: true })).toHaveCount(0)
      }
    })
  })
}

import { setLayoutFixtureSession } from './profile-session'
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockCalendarSyncEvent, createMockGamificationProfile, createMockGoal, createMockNotification, createMockRescheduleSuggestion, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarAutoSyncStateSchema, calendarEventsResponseSchema } from '@orbit/shared/types/calendar'
import { calendarMonthResponseSchema, createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema, rescheduleSuggestionResponseSchema } from '@orbit/shared/types/habit'
import { gamificationProfileSchema, retrospectiveResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { profileSchema, type Profile } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { inspectDestinationHeading } from './destination-heading'

const today = '2026-09-04'
const habitId = 'habit-1'
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), children: [], dueDate: today, dueTime: '08:00:00' })
const schedule = makeHabitScheduleItem({ ...habit, children: [], hasSubHabits: false, scheduledDates: [today], isOverdue: true })
const schedules = Array.from({ length: 20 }, (_, index) => makeHabitScheduleItem({ ...schedule, id: index === 0 ? habitId : `habit-${index + 1}`, title: index === 0 ? habit.title : `Read ${index + 1}`, position: index }))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: schedules, page: 1, pageSize: 20, totalPages: 3, totalCount: 41 })
const event = createMockCalendarSyncEvent({ title: 'Team meeting', startDate: today, startTime: '09:00', isImported: false })
const events = calendarEventsResponseSchema.parse([event, createMockCalendarSyncEvent({ id: 'event-2', title: 'Planning', startDate: today, startTime: '13:00' }), createMockCalendarSyncEvent({ id: 'event-3', title: 'Review', startDate: today, startTime: '16:00' })])
const notifications = notificationsResponseSchema.parse({ items: [createMockNotification({ isRead: false }), createMockNotification({ id: 'notif-2', title: 'Weekly summary', isRead: true })], unreadCount: 1 })
const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })

async function installActionFixtures(context: BrowserContext, profile: Profile) {
  const responses: ReadonlyArray<readonly [string, unknown]> = [
    [API.habits.get(habitId), habit],
    [API.habits.metrics(habitId), metrics],
    [API.habits.logs(habitId), []],
    [API.habits.calendarMonth, calendarMonthResponseSchema.parse({ habits: schedules, logs: {} })],
    [API.goals.list, paginatedGoalResponseSchema.parse({ items: [createMockGoal(), createMockGoal({ id: 'goal-2', title: 'Walk each week', position: 1 })], page: 1, pageSize: 100, totalCount: 2, totalPages: 1 })],
    [API.gamification.profile, gamificationProfileSchema.parse(createMockGamificationProfile({ lastActiveDate: today }))],
    [API.gamification.streak, streakInfoSchema.parse({ currentStreak: 7, longestStreak: 14, lastActiveDate: today, freezesUsedThisMonth: 0, freezesAvailable: 1, maxFreezesPerMonth: 3, isFrozenToday: false, recentFreezeDates: [] })],
    [API.habits.retrospective, retrospectiveResponseSchema.parse({ period: 'month', metrics: createMockRetrospectiveMetrics(), narrative: { highlights: 'A steady month.', missed: 'Keep reading.', trends: 'Consistent weeks.', suggestion: 'Continue.' }, fromCache: false })],
    [API.calendar.events, events],
    [API.calendar.autoSyncState, calendarAutoSyncStateSchema.parse({ hasGoogleConnection: true, enabled: true, status: 'Idle', lastSyncedAt: null })],
    [API.calendar.autoSyncSuggestions, []],
    [API.notifications.list, notifications],
    [API.habits.rescheduleSuggestion(habitId), rescheduleSuggestionResponseSchema.parse({ suggestion: createMockRescheduleSuggestion({ dueDate: '2026-09-05' }), fromCache: false })],
  ]
  await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }, { path: API.habits.list, body: habits }])
  for (const [path, response] of responses) {
    await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path, (route) => route.fulfill({ json: response }))
  }
}

async function assertActionGeometry(page: Page, surface?: Locator) {
  await page.evaluate(() => document.fonts.ready)
  const owner = surface ?? page.locator('[data-shell-column]')
  const geometry = await owner.evaluate((root) => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden'
    }
    const pills = [...root.querySelectorAll<HTMLElement>('.orbit-pill-action')].filter(visible)
    const pairs: Array<{ labels: string[]; heights: number[]; gap: number; stacked: boolean; requiredWidth: number; availableWidth: number }> = []
    const sharedWidth = (a: HTMLElement, b: HTMLElement) => {
      let shared = a.parentElement!
      while (!shared.contains(b)) shared = shared.parentElement!
      const style = getComputedStyle(shared)
      return shared.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
    }
    for (let first = 0; first < pills.length; first += 1) {
      for (let second = first + 1; second < pills.length; second += 1) {
        const a = pills[first]!
        const b = pills[second]!
        const aBox = a.getBoundingClientRect()
        const bBox = b.getBoundingClientRect()
        const overlapX = Math.min(aBox.right, bBox.right) - Math.max(aBox.left, bBox.left)
        const overlapY = Math.min(aBox.bottom, bBox.bottom) - Math.max(aBox.top, bBox.top)
        const stacked = overlapX > 0 && overlapY <= 0
        if (!stacked && overlapY <= 0) continue
        const gap = stacked
          ? Math.max(aBox.top, bBox.top) - Math.min(aBox.bottom, bBox.bottom)
          : Math.max(aBox.left, bBox.left) - Math.min(aBox.right, bBox.right)
        if (gap >= 24) continue
        pairs.push({ labels: [a.textContent || a.ariaLabel || '', b.textContent || b.ariaLabel || ''], heights: [aBox.height, bBox.height], gap, stacked, requiredWidth: aBox.width + bBox.width + 12, availableWidth: sharedWidth(a, b) })
      }
    }
    return { mediumCount: pills.filter((pill) => pill.dataset.size === 'md').length, pairs }
  })
  expect(geometry.mediumCount).toBeLessThanOrEqual(1)
  for (const pair of geometry.pairs) {
    expect(Math.abs(pair.heights[0]! - pair.heights[1]!), pair.labels.join(', ')).toBeLessThan(0.5)
    expect(pair.gap, pair.labels.join(', ')).toBeGreaterThanOrEqual(11.5)
    if (pair.stacked) expect(pair.requiredWidth, pair.labels.join(', ')).toBeGreaterThan(pair.availableWidth)
  }
}

for (const width of [412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : ptBR
    test.describe(`Action rows at ${width}px in ${locale}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, plan: 'pro', hasProAccess: true, language: locale, googleCalendarAutoSyncEnabled: true, canViewGamification: true, marketingEmailConsent: null })
      test.use({ viewport: { width, height: 915 }, appLocale: locale, subscriptionState: 'stripe', layoutProfile: profile })
      test.beforeEach(async ({ context }) => { await installActionFixtures(context, profile) })

      const readySelectors: Readonly<Record<string, string>> = {
        '/': '[data-testid="habit-row"]',
        '/progress': '[data-testid="progress-xp-summary"]',
        '/profile/account': '[data-testid="profile-settings-group-account"] [data-slot="list-row-title"]',
        '/profile/preferences': '[data-testid="profile-settings-group-preferences"] [data-slot="list-row-title"]',
        '/profile/astra': '[data-testid="profile-api-keys"]',
        '/profile/notifications': '[role="switch"]',
        '/habits/new': '[data-habit-create-screen] form',
        '/upgrade': '.orbit-pill-action',
        '/notifications': 'ul[aria-busy="false"] > li[data-read]',
        '/about': '[data-testid="about-content"]',
        '/support': 'form .orbit-pill-action',
      }

      for (const route of ['/', '/progress', '/profile/account', '/profile/preferences', '/profile/astra', '/profile/notifications', '/habits/new', `/habits/${habitId}`, '/upgrade', '/notifications', '/about', '/support']) {
        test(`${route} keeps adjacent pills in one size with sufficient clearance`, async ({ page }) => {
          const inspectActions = async () => {
            const main = page.locator('#orbit-main')
            const column = page.locator('[data-shell-column]')
            if (route !== `/habits/${habitId}`) await expect(column.locator(readySelectors[route]!).first()).toBeVisible()
            await expect(main.locator('[aria-busy="true"], .skeleton-pulse')).toHaveCount(0)
            if (route === '/habits/new') {
              const submit = column.locator('[data-shell-pinned-slot] [data-habit-create-action] .orbit-pill-action')
              await expect(submit).toBeVisible()
              await expect(submit).toBeDisabled()
              await expect(submit).toHaveAttribute('data-size', 'md')
            }
            if (route === '/upgrade') await expect(page.getByRole('button', { name: messages.upgrade.billing.payment.change, exact: true })).toBeVisible()
            if (route === '/progress') await expect(page.locator('[data-goal-id]')).toHaveCount(2)
            if (route === '/notifications') {
              const consent = page.getByRole('dialog', { name: messages.marketingConsent.prompt.title })
              await expect(consent).toBeVisible()
              await consent.getByRole('button', { name: messages.common.close, exact: true }).click()
              await expect(consent).toHaveCount(0)
              const header = column.locator('[data-shell-header]')
              await expect(header.getByRole('button', { name: messages.notifications.options, exact: true })).toBeVisible()
              await expect(main.getByText(notifications.items[0]!.title, { exact: true })).toBeVisible()
              await expect(main.getByText(notifications.items[1]!.title, { exact: true })).toBeVisible()
              await header.getByRole('button', { name: messages.notifications.options, exact: true }).click()
              const menu = page.getByRole('menu', { name: messages.notifications.options, exact: true })
              await expect(menu.getByRole('menuitem', { name: messages.notifications.markAllReadMenu, exact: true })).toBeVisible()
              await menu.getByRole('menuitem', { name: messages.notifications.deleteAll, exact: true }).click()
              const confirmation = page.getByRole('dialog', { name: messages.notifications.deleteAllAction, exact: true })
              await expect(confirmation).toBeVisible()
              const actions = confirmation.locator('[data-slot="action-row"]')
              await expect(actions.locator('.orbit-pill-action')).toHaveCount(2)
              await expect(actions.getByRole('button', { name: messages.common.cancel, exact: true })).toHaveAttribute('data-size', 'sm')
              await expect(actions.getByRole('button', { name: messages.notifications.deleteAllAction, exact: true })).toHaveAttribute('data-size', 'sm')
              await expect(actions).toHaveCSS('justify-content', 'flex-end')
              await expect(actions).toHaveCSS('gap', '12px')
              await assertActionGeometry(page, confirmation)
            }
            await assertActionGeometry(page)
          }
          if (route === `/habits/${habitId}`) await inspectDestinationHeading(page, route, habit.title, inspectActions)
          else {
            await page.goto(route)
            await inspectActions()
          }
        })
      }

      test('calendar event rows open preselected imports with small sheet actions and no per-event pill', async ({ page }) => {
        await page.goto('/calendar')
        const card = page.locator('section[data-field-surface="card"]').filter({ has: page.getByText(event.title, { exact: true }) })
        await expect(card).toBeVisible()
        await expect(card.locator('.orbit-pill-action')).toHaveCount(0)
        for (const calendarEvent of events) {
          const eventRow = card.getByRole('button').filter({ has: page.getByText(calendarEvent.title, { exact: true }) })
          await expect(eventRow).toBeVisible()
          await expect(eventRow).toHaveRole('button')
          await expect(eventRow).not.toHaveClass(/orbit-pill-action/)
          await expect(eventRow).not.toHaveAttribute('data-size')
          await expect(eventRow.locator('.orbit-pill-action')).toHaveCount(0)
          await expect(eventRow.getByRole('button')).toHaveCount(0)
        }
        await assertActionGeometry(page)
        for (const calendarEvent of events) {
          await card.getByRole('button').filter({ has: page.getByText(calendarEvent.title, { exact: true }) }).click()
          const sheet = page.getByRole('dialog', { name: messages.calendar.calendars.title, exact: true })
          await expect(sheet).toBeVisible()
          for (const importEvent of events) {
            const selection = sheet.getByRole('button').filter({ has: page.getByText(importEvent.title, { exact: true }) })
            await expect(selection).toHaveAttribute('aria-pressed', String(importEvent.id === calendarEvent.id))
          }
          const actions = sheet.locator('[data-slot="sheet-actions"] [data-slot="action-row"]')
          await expect(sheet.locator('[data-slot="action-row"]')).toHaveCount(1)
          await expect(actions).toHaveCSS('justify-content', 'flex-end')
          await expect(actions.locator('.orbit-pill-action')).toHaveCount(1)
          await expect(actions.getByRole('button')).toBeEnabled()
          await expect(sheet.locator('.orbit-pill-action:not([data-size="sm"])')).toHaveCount(0)
          await expect(sheet.locator('[aria-busy="true"], .skeleton-pulse')).toHaveCount(0)
          await assertActionGeometry(page, sheet)
          await sheet.getByRole('button', { name: messages.common.close, exact: true }).click()
          await expect(sheet).toHaveCount(0)
        }
      })

      test('search pagination uses one action row', async ({ page, context }) => {
        const matches = Array.from({ length: 41 }, (_, index) => makeHabitScheduleItem({ ...schedule, id: `search-${index + 1}`, title: `Read ${index + 1}`, position: index, searchMatches: [{ field: 'title', value: null }] }))
        for (const pageNumber of [1, 2, 3]) {
          const response = createPaginatedSchema(habitScheduleItemSchema).parse({ items: matches.slice((pageNumber - 1) * 20, pageNumber * 20), page: pageNumber, pageSize: 20, totalPages: 3, totalCount: matches.length })
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: response, query: { search: 'Read', page: String(pageNumber) } }])
        }
        await page.goto('/search')
        const consent = page.getByRole('dialog', { name: messages.marketingConsent.prompt.title })
        await consent.getByRole('button', { name: messages.common.close, exact: true }).click()
        await expect(consent).toHaveCount(0)
        await page.getByRole('combobox', { name: messages.habits.search.title }).fill('Read')
        const main = page.getByRole('main')
        const next = main.getByRole('button', { name: messages.habits.search.next, exact: true })
        const previous = main.getByRole('button', { name: messages.habits.search.previous, exact: true })
        await expect(main.getByRole('option')).toHaveCount(20)
        await expect(next).toBeEnabled()
        await next.click()
        await expect(main.getByText('Read 21', { exact: true })).toBeVisible()
        await expect(main.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
        await expect(previous).toBeEnabled()
        await expect(next).toBeEnabled()
        await expect(main.locator('[data-slot="action-row"]').filter({ has: page.getByRole('button', { name: messages.habits.search.previous, exact: true }) }).locator('.orbit-pill-action')).toHaveCount(2)
        await assertActionGeometry(page, main)
      })

      test('delete confirmation keeps a trailing small action pair', async ({ page }) => {
        await page.goto(`/habits/${habitId}`)
        await page.getByRole('button', { name: messages.habits.detail.delete, exact: true }).click()
        const sheet = page.getByRole('dialog', { name: messages.habits.deleteConfirmTitle })
        await expect(sheet).toBeVisible()
        await expect(sheet.locator('.orbit-pill-action')).toHaveCount(2)
        await assertActionGeometry(page, sheet)
      })

      test('reschedule sheet keeps one small action row', async ({ page }) => {
        await page.goto('/')
        const consent = page.getByRole('dialog', { name: messages.marketingConsent.prompt.title })
        await expect(consent).toBeVisible()
        await consent.getByRole('button', { name: messages.common.close, exact: true }).click()
        await expect(consent).toHaveCount(0)
        const row = page.getByTestId('habit-row').filter({ hasText: habit.title }).first()
        await row.locator('[data-habit-row-control="menu"]').click()
        await page.getByRole('menuitem', { name: messages.habits.actions.reschedule, exact: true }).click()
        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible()
        await expect(sheet.locator('.orbit-pill-action')).toHaveCount(2)
        await assertActionGeometry(page, sheet)
      })
    })
  }
}

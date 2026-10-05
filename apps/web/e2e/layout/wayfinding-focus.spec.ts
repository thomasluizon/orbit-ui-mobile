import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockRecap } from '@orbit/shared/__tests__/factories'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { goalDetailWithMetricsSchema, paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { habitDetailSchema, habitMetricsSchema, createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { buildAccountScopedStorageKey, buildRecapRequestUrl, ONBOARDING_PRO_PENDING_KEY } from '@orbit/shared/utils'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { readFieldIndicators, inspectFocusedRing } from './focus-indicators'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title: 'Caminhar', dueTime: '08:00:00', children: [] })
const schedule = makeHabitScheduleItem({ id: habit.id, title: habit.title, dueTime: habit.dueTime })
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })
const goal = createMockGoal()
const goals = paginatedGoalResponseSchema.parse({ items: [goal], page: 1, pageSize: 100, totalCount: 1, totalPages: 1 })
const goalDetail = goalDetailWithMetricsSchema.parse({ goal: { ...goal, progressHistory: [] }, metrics: {
  progressPercentage: goal.progressPercentage, velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline', habitAdherence: [],
} })

async function installCollections(context: BrowserContext) {
  for (const [path, payload] of [
    [API.habits.list, habits], [API.habits.get(habit.id), habit], [API.habits.logs(habit.id), []],
    [API.habits.metrics(habit.id), metrics], [API.goals.list, goals], [API.goals.detail(goal.id), goalDetail],
    [buildRecapRequestUrl('week'), createMockRecap()],
  ] as const) {
    await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === path.split('?')[0], (route) => route.fulfill({ json: payload }))
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (const animation of document.getAnimations()) animation.finish()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

async function expectWayfindingFocus(page: Page, target: Locator) {
  await expect(target).toHaveCount(1)
  await settle(page)
  await page.keyboard.press('Shift')
  await target.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('Expected a wayfinding element')
    element.blur()
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1
  })
  const shadowAtRest = await target.evaluate((element) => getComputedStyle(element).boxShadow)
  await target.focus()
  await expect(target).toBeFocused()
  const paint = await target.evaluate((element) => {
    const style = getComputedStyle(element)
    return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow }
  })
  expect(paint).toEqual({ outline: 'none', width: '0px', shadow: shadowAtRest })
  expect(await readFieldIndicators(target, '[tabindex="-1"]')).toEqual([])
}

async function expectHabitCreateControls(page: Page) {
  await page.getByRole('heading', { name: ptBR.habits.form.newHabit, exact: true }).focus()
  const visited = new Set<number>()
  for (let index = 0; index < 100; index += 1) {
    await page.keyboard.press('Tab')
    const ring = await inspectFocusedRing(page)
    if (!ring) continue
    const position = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, textarea, select, [tabindex]')].indexOf(document.activeElement!))
    if (visited.has(position)) break
    visited.add(position)
    expect(ring.focusVisible).toBe(true)
    expect(ring.indicators, ring.focused).toHaveLength(1)
    expect(await page.evaluate(() => document.activeElement?.matches('h1, [data-habit-create-screen]'))).toBe(false)
  }
  expect(visited.size).toBeGreaterThan(3)
}

async function inspectTitles(page: Page) {
  for (const [path, title, entry] of [
    ['/habits/new?from=%2F', ptBR.habits.form.newHabit, '/'],
    ['/profile/account', ptBR.profile.submenus.account, '/profile'],
  ] as const) {
    await page.goto(path)
    const heading = page.getByRole('heading', { name: title, exact: true })
    await expect(heading).toBeVisible()
    await expectWayfindingFocus(page, heading)
    if (path.startsWith('/habits')) await expectHabitCreateControls(page)
    await page.goto(entry)
    if (entry === '/') await page.getByRole('button', { name: ptBR.habits.createManually, exact: true }).click()
    else await page.getByTestId('profile-settings-group-you').getByRole('link').filter({ hasText: profileFixture.name }).click()
    await expect(page).toHaveURL((url) => url.pathname === path.split('?')[0])
    await expect(heading).toBeFocused()
    await expectWayfindingFocus(page, heading)
  }
}

async function inspectDestinations(page: Page) {
  for (const path of ['/', '/calendar', '/progress', '/profile']) {
    await page.goto(path)
    const main = page.getByRole('main')
    await expectWayfindingFocus(page, main.locator('h1').first())
    await expectWayfindingFocus(page, main)
    await expectWayfindingFocus(page, page.locator('[data-shell-scroller]'))
    if (path === '/') {
      const row = page.getByTestId('habit-row').first()
      await expect(row).toBeVisible()
      await expectWayfindingFocus(page, row)
      await expectWayfindingFocus(page, row.locator('xpath=ancestor::div[@tabindex="-1"]').first())
    }
    if (path === '/progress') {
      await page.getByRole('button').filter({ hasText: goal.title }).click()
      await expectWayfindingFocus(page, page.locator('[data-goal-detail] h1'))
      await expectWayfindingFocus(page, page.locator('[data-goal-detail]'))
    }
  }
}

async function inspectConversation(page: Page, width: number) {
  await page.goto('/')
  await page.locator('[data-shell-pinned-slot] [data-open-conversation]').click()
  const panel = page.locator(`[data-shell-conversation="${width < 1024 ? 'overlay' : 'panel'}"]`)
  await expect(panel).toBeVisible()
  await expectWayfindingFocus(page, panel)
  await expectWayfindingFocus(page, panel.locator('[data-composer-root]'))
  const heading = panel.locator('h1')
  await expectWayfindingFocus(page, heading)
  await panel.locator('[data-composer-input]').focus()
  expect((await inspectFocusedRing(page))?.indicators).toHaveLength(1)
}

for (const width of [600, 1352]) {
  for (const mode of ['dark', 'light'] as const) {
    test.describe(`wayfinding focus at ${width}px in ${mode}`, () => {
      test.use({ appLocale: 'pt-BR', layoutProfile: { themePreference: mode }, viewport: { width, height: 915 } })
      test('keeps every owning focus surface quiet and control rings visible', async ({ page, context }) => {
        test.setTimeout(120_000)
        await installCollections(context)
        await inspectTitles(page)
        await inspectDestinations(page)
        await page.goto(`/habits/${habit.id}`)
        await expect(page.locator('[data-habit-detail-content]')).toBeVisible()
        await expectWayfindingFocus(page, page.locator('[data-habit-detail-content] h1'))
        await expectWayfindingFocus(page, page.locator('.habit-detail-strip'))
        await page.goto('/notifications')
        await expectWayfindingFocus(page, page.getByRole('list', { name: ptBR.notifications.title, exact: true }))
        await inspectConversation(page, width)
        await page.goto('/wrapped')
        await page.getByRole('button', { name: ptBR.wrapped.start, exact: true }).click()
        await page.getByTestId('wrapped-pager').getByRole('button', { name: ptBR.wrapped.next, exact: true }).click()
        for (const id of ['wrapped-previous-zone', 'wrapped-next-zone']) {
          const zone = page.getByTestId(id)
          await zone.focus()
          await expect(zone).toBeFocused()
          expect(await zone.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px')
        }
        const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'pt-BR' })
        await setLayoutProfileSession(context, profile)
        await page.addInitScript((key) => localStorage.setItem(key, '1'), buildAccountScopedStorageKey(ONBOARDING_PRO_PENDING_KEY, 'hermetic-perf-user'))
        await page.goto('/')
        await expect(page.locator('[data-onboarding-step="paywall"]')).toBeVisible()
        await expectWayfindingFocus(page, page.locator('#onboarding-title'))
        await page.emulateMedia({ forcedColors: 'active' })
        await expectWayfindingFocus(page, page.locator('#onboarding-title'))
      })
    })
  }
}

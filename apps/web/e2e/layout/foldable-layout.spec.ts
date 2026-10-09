import { completeInstallOnboarding } from './install-onboarding'
import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import { SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { goalSchema, paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { LAYOUT_ORIGIN } from '../support/env'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { loadAppFonts } from '../../__tests__/support/app-fonts'

const fixtureDate = '2026-09-04'

const windows = ([[360, 740], [412, 915], [480, 800], [600, 900], [840, 900], [1100, 900]] as const)
  .flatMap(([width, height]) => [{ width, height }, { width: height, height: width }])
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), description: 'A recurring habit with a longer description to exercise wrapping in the phone column.' })
const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null })
const goals = paginatedGoalResponseSchema.parse({
  items: Array.from({ length: 8 }, (_, index) => goalSchema.parse({
    id: `foldable-goal-${index}`, title: `Read a longer book series ${index}`, description: null,
    targetValue: 10, currentValue: 2, unit: 'books', status: 'Active', deadline: null,
    position: index, createdAtUtc: '2026-08-01T12:00:00Z', completedAtUtc: null,
    progressPercentage: 20, linkedHabits: [],
  })),
  page: 1, pageSize: 100, totalCount: 8, totalPages: 1,
})

async function assertColumnGeometry(page: Page, viewportWidth: number, hasComposer: boolean) {
  const column = page.locator('[data-shell-column]').last()
  await expect(column).toBeVisible()
  const geometry = await column.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const available = element.parentElement!.getBoundingClientRect()
    const scroller = element.querySelector<HTMLElement>('[data-shell-scroller]')!
    scroller.scrollTop = scroller.scrollHeight
    const chrome = element.querySelector('[data-shell-bottom]')
    const content = Array.from(scroller.children).filter((child) => !child.hasAttribute('data-shell-scroll-origin') && child.getBoundingClientRect().height > 0).at(-1)!
    const horizontalScrollers = Array.from(element.querySelectorAll<HTMLElement>('*'))
      .filter((child) => ['auto', 'scroll'].includes(getComputedStyle(child).overflowX))
      .filter((child) => child.getBoundingClientRect().width > 1 && child.getBoundingClientRect().height > 1)
      .map((child) => {
        const target = child.getBoundingClientRect()
        return { left: target.left, right: target.right, label: child.getAttribute('aria-label') ?? 'horizontal scroller' }
      })
    return {
      documentWidth: document.documentElement.scrollWidth,
      width: bounds.width, left: bounds.left, right: bounds.right,
      leftGap: bounds.left - available.left, rightGap: available.right - bounds.right,
      scrollerWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
      clearance: chrome ? chrome.getBoundingClientRect().top - content.getBoundingClientRect().bottom : null,
      chromeBottom: chrome?.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight, horizontalScrollers,
    }
  })
  expect(geometry.documentWidth).toBe(viewportWidth)
  expect(geometry.width).toBeLessThanOrEqual(SHELL_CONTENT_MAX_WIDTH)
  if (viewportWidth < 1024) expect(geometry.width).toBe(Math.min(viewportWidth, SHELL_CONTENT_MAX_WIDTH))
  expect(Math.abs(geometry.leftGap - geometry.rightGap)).toBeLessThanOrEqual(1)
  expect(geometry.scrollerWidth).toBe(geometry.clientWidth)
  if (geometry.clearance !== null) expect(geometry.clearance).toBeGreaterThanOrEqual(viewportWidth < 1024 && hasComposer ? 95 : 31)
  if (geometry.chromeBottom !== undefined) expect(geometry.chromeBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  for (const scroller of geometry.horizontalScrollers) {
    expect(scroller.left, scroller.label).toBeGreaterThanOrEqual(geometry.left - 1)
    expect(scroller.right, scroller.label).toBeLessThanOrEqual(geometry.right + 1)
  }
}

async function assertReachableControls(container: Locator) {
  const controls = container.locator('button, input, textarea, a, [role="tab"]')
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue
    const bounds = await control.boundingBox()
    if (!bounds || bounds.width <= 1 || bounds.height <= 1) continue
    await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
    await expect(control).toBeInViewport({ ratio: 1 })
    const geometry = await control.evaluate((element) => {
      const column = element.closest('[data-shell-column]') ?? element.closest('main')!.firstElementChild!
      const target = element.getBoundingClientRect()
      const bounds = column.getBoundingClientRect()
      return { left: target.left, right: target.right, columnLeft: bounds.left, columnRight: bounds.right }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.columnLeft - 1)
    expect(geometry.right).toBeLessThanOrEqual(geometry.columnRight + 1)
  }
}

for (const { width, height } of windows) {
  test.describe(`foldable destinations at ${width} by ${height}`, () => {
    test.use({ viewport: { width, height } })

    for (const [name, path] of [['Hoje', '/'], ['Calendário', '/calendar'], ['Progresso', '/progress'], ['Perfil', '/profile'], ['Habit detail', `/habits/${habit.id}`]] as const) {
      test(`${name} centres content without overflow or clipped chrome`, async ({ page, context }) => {
        await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
        await setLayoutProfileSession(context, profileFixture)
        const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
          items: Array.from({ length: 12 }, (_, index) => makeHabitScheduleItem({
            id: `foldable-habit-${index}`, title: `${'Read a longer book chapter '.repeat(4)}${index}`,
            scheduledDates: [fixtureDate], dueDate: fixtureDate, children: [], hasSubHabits: false,
          })),
          page: 1, pageSize: 200, totalCount: 12, totalPages: 1,
        })
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, (route) => route.fulfill({ json: calendarMonthResponseSchema.parse({ habits: habits.items, logs: {} }) }))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list, (route) => route.fulfill({ json: goals }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))
        await page.goto(name === 'Hoje' ? `/?date=${fixtureDate}` : path)
        await loadAppFonts(page)
        if (name === 'Hoje') {
          await page.getByRole('button', { name: en.habits.listOptions }).click()
          await page.getByRole('menu', { name: en.habits.listOptions })
            .getByRole('menuitem', { name: en.habits.refresh }).click()
          await expect(page.locator('[data-habit-title]')).toHaveCount(habits.items.length)
          await expect(page.locator('[data-habit-title]').first()).toHaveAttribute('data-habit-title', habits.items[0]!.title)
          await expect(page.getByRole('menu', { name: en.habits.listOptions })).toHaveCount(0)
        }
        if (name === 'Calendário') {
          await expect(page.getByRole('radio', { name: en.calendar.view.month, exact: true })).toBeChecked()
          await expect(page.getByTestId('calendar-grid')).toBeVisible()
          await page.getByTestId(`calendar-day-select-${fixtureDate}`).click()
          await expect(page.getByText(habits.items[0]!.title, { exact: true })).toBeVisible()
        }
        if (name === 'Progresso') await expect(page.getByText(goals.items[0]!.title, { exact: true })).toBeVisible()
        if (name === 'Perfil') await expect(page.getByTestId('profile-settings-groups')).toBeVisible()
        if (name === 'Habit detail') await expect(page.getByRole('heading', { name: habit.title, exact: true })).toBeVisible()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('[data-shell-pinned-slot]')).toHaveCount(['Hoje', 'Habit detail'].includes(name) ? 1 : 0)
        await assertColumnGeometry(page, width, ['Hoje', 'Habit detail'].includes(name))
        await assertReachableControls(page.locator('[data-shell-column]').last())
      })
    }
  })

  test.describe(`foldable sign-in at ${width} by ${height}`, () => {
    test.use({ viewport: { width, height }, storageState: { cookies: [], origins: [] } })
    test('centres the sign-in form and keeps every action reachable', async ({ page, context }) => {
      await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
      await completeInstallOnboarding(page)
      await page.goto('/login')
      await loadAppFonts(page)
      await expect(page.getByRole('heading', { name: en.auth.emailTitle })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const geometry = await page.locator('main > div').first().evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const main = element.closest('main')!.getBoundingClientRect()
        return {
          documentWidth: document.documentElement.scrollWidth, width: bounds.width,
          leftGap: bounds.left - main.left, rightGap: main.right - bounds.right,
          clipped: Array.from(element.querySelectorAll('button, input, a')).filter((control) => {
            const target = control.getBoundingClientRect()
            return target.width > 1 && (target.left < bounds.left - 1 || target.right > bounds.right + 1)
          }).map((control) => control.textContent),
        }
      })
      expect(geometry.documentWidth).toBe(width)
      expect(geometry.width).toBeLessThanOrEqual(SHELL_CONTENT_MAX_WIDTH)
      expect(Math.abs(geometry.leftGap - geometry.rightGap)).toBeLessThanOrEqual(1)
      expect(geometry.clipped).toEqual([])
      await assertReachableControls(page.locator('main > div').first())
    })
  })
}

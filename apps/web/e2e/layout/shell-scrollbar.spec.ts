import { expect, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { measureScrollbarGutter } from './scrollbar-geometry'
import { measureScrollbarPaint } from './scrollbar-paint'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const calendarMonth = calendarMonthResponseSchema.parse({
  habits: Array.from({ length: 12 }, (_, index) => createMockHabitScheduleItem({
    id: `habit-${index}`, title: `Caminhar ${index + 1}`, dueDate: '2026-09-04',
    scheduledDates: Array.from({ length: 30 }, (_, day) => `2026-09-${String(day + 1).padStart(2, '0')}`),
  })),
  logs: {},
})
const goals = paginatedGoalResponseSchema.parse({
  ...emptyGoalsPageFixture,
  items: Array.from({ length: 40 }, (_, index) => createMockGoal({
    id: `goal-${index}`, title: `Livro ${index + 1}`, position: index,
  })),
  totalCount: 40,
})

async function expectScrollbarGeometry(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-scrollbar-probe]').forEach((element) => element.removeAttribute('data-scrollbar-probe'))
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      const style = getComputedStyle(element)
      if ([style.overflowX, style.overflowY].some((overflow) => overflow === 'auto' || overflow === 'scroll')) {
        element.setAttribute('data-scrollbar-probe', '')
      }
    }
  })
  const gutter = await page.locator('main[data-shell-scroller]').evaluate(measureScrollbarGutter)
  expect(gutter).toBe(4)
  const scrollers = page.locator('[data-scrollbar-probe]')
  expect(await scrollers.count()).toBeGreaterThan(0)
  for (const scroller of await scrollers.all()) {
    const description = await scroller.evaluate((element) => `${element.tagName} ${element.getAttribute('class')}`)
    const reservation = await scroller.evaluate((element: HTMLElement) => {
      const style = getComputedStyle(element)
      const scrollbar = getComputedStyle(element, '::-webkit-scrollbar')
      const visible = element.getClientRects().length > 0
      const hidden = style.scrollbarWidth === 'none' || scrollbar.display === 'none'
      return {
        vertical: visible && !hidden && (style.scrollbarGutter.includes('stable') || element.scrollHeight > element.clientHeight),
        horizontal: visible && !hidden && element.scrollWidth > element.clientWidth,
        horizontalGutter: element.offsetHeight - element.clientHeight
          - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
      }
    })
    expect.soft(await scroller.evaluate(measureScrollbarGutter), `${description} vertical gutter`).toBe(reservation.vertical ? gutter : 0)
    expect.soft(reservation.horizontalGutter, `${description} horizontal gutter`).toBe(reservation.horizontal ? gutter : 0)
  }
}

async function expectRestingEdge(page: Page) {
  const scroller = page.locator('main[data-shell-scroller]')
  expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(1500)
  const resting = await measureScrollbarPaint(scroller)
  expect.soft(resting.backgroundPixels, 'resting trailing edge matches the canvas').toBe(resting.totalPixels)
  const bounds = await scroller.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width - 16, bounds!.y + bounds!.height / 2)
  await page.waitForTimeout(300)
  expect((await measureScrollbarPaint(scroller)).thumbPixels, 'hovered thumb paints the hairline').toBeGreaterThan(0)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  const afterHover = await measureScrollbarPaint(scroller)
  expect.soft(afterHover.backgroundPixels, 'leaving clears the trailing edge').toBe(afterHover.totalPixels)
}

for (const width of [1352, 1100, 600]) {
  test.describe(`quiet scrollbars at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 706 }, layoutProfile: { themePreference: 'dark' } })
    test.beforeEach(async ({ context }) => {
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
        (route) => route.fulfill({ json: calendarMonth }))
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
        (route) => route.fulfill({ json: goals }))
    })

    test('keeps the 4px gutter and paints thumbs only on hover', async ({ page }) => {
      await page.goto('/calendar')
      for (const view of ['month', 'agenda', 'range'] as const) {
        await page.getByRole('radio', { name: ptBR.calendar.view[view], exact: true }).click()
        if (view === 'month') {
          await expect(page.getByTestId('calendar-day-select-2026-09-04')).toBeVisible()
          await expect(page.getByText(calendarMonth.habits[11]!.title, { exact: true }).first()).toBeAttached()
        } else if (view === 'agenda') {
          await expect(page.getByTestId('calendar-agenda-day')).toHaveCount(7)
          await expect(page.getByText(calendarMonth.habits[0]!.title, { exact: true }).first()).toBeAttached()
        } else {
          await expect(page.getByRole('region').filter({ has: page.getByTestId('month-grid-days') })).toHaveAttribute('aria-busy', 'false')
        }
        await page.evaluate(() => document.fonts.ready)
        await expectScrollbarGeometry(page)
        if (view === 'month') await expectRestingEdge(page)
      }
      await page.goto('/progress')
      await expect(page.locator('[data-goal-id]')).toHaveCount(goals.items.length)
      await page.evaluate(() => document.fonts.ready)
      await expectScrollbarGeometry(page)
      await expectRestingEdge(page)
      await page.goto('/')
      await expect(page.locator('[data-today-header-actions]')).toBeVisible()
      await expect(page.locator('[data-composer-input]')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expectScrollbarGeometry(page)
    })
  })
}

import { expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { measureScrollbarGutter } from './scrollbar-geometry'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--enable-features=OverlayScrollbar'] } })

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

async function expectOverlayGeometry(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-overlay-scrollbar-probe]').forEach((element) => element.removeAttribute('data-overlay-scrollbar-probe'))
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      const style = getComputedStyle(element)
      if ([style.overflowX, style.overflowY].some((overflow) => overflow === 'auto' || overflow === 'scroll')) {
        element.setAttribute('data-overlay-scrollbar-probe', '')
      }
    }
  })
  const scrollers = page.locator('[data-overlay-scrollbar-probe]')
  expect(await scrollers.count()).toBeGreaterThan(0)
  for (const scroller of await scrollers.all()) {
    const description = await scroller.evaluate((element) => `${element.tagName} ${element.getAttribute('class')}`)
    expect.soft(await scroller.evaluate(measureScrollbarGutter), `${description} vertical gutter`).toBe(0)
    expect.soft(await scroller.evaluate((element: HTMLElement) => {
      const style = getComputedStyle(element)
      return element.offsetHeight - element.clientHeight
        - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)
    }), `${description} horizontal gutter`).toBe(0)
  }
}

async function expectRestingEdge(page: Page) {
  const scroller = page.locator('main[data-shell-scroller]')
  expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(1500)
  const { clip, background } = await scroller.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = getComputedStyle(element).getPropertyValue('--bg').trim()
    context.fillRect(0, 0, 1, 1)
    return {
      clip: { x: bounds.right - 8, y: bounds.top, width: 8, height: bounds.height },
      background: Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3),
    }
  })
  const pixels = await sharp(await page.screenshot({ clip, scale: 'css' })).removeAlpha().raw().toBuffer()
  expect(pixels.length).toBe(8 * Math.round(clip.height) * 3)
  let differingPixels = 0
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (background.some((channel, index) => pixels[offset + index] !== channel)) differingPixels++
  }
  expect.soft(differingPixels, 'resting trailing edge matches the canvas').toBe(0)
}

for (const width of [1352, 1100, 600]) {
  test.describe(`platform overlay scrollbars at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 706 }, layoutProfile: { themePreference: 'dark' } })
    test.beforeEach(async ({ context }) => {
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
        (route) => route.fulfill({ json: calendarMonth }))
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
        (route) => route.fulfill({ json: goals }))
    })

    test('keeps scrollbars over the content and clears the edge at rest', async ({ page }) => {
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
        await expectOverlayGeometry(page)
        if (view === 'month') await expectRestingEdge(page)
      }
      await page.goto('/progress')
      await expect(page.locator('[data-goal-id]')).toHaveCount(goals.items.length)
      await page.evaluate(() => document.fonts.ready)
      await expectOverlayGeometry(page)
      await expectRestingEdge(page)
      await page.goto('/')
      await expect(page.locator('[data-today-header-actions]')).toBeVisible()
      await expect(page.locator('[data-composer-input]')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expectOverlayGeometry(page)
    })
  })
}

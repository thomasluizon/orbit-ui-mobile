import { expect, type Locator } from '@playwright/test'
import { expectDayCircle, expectDayCircleHover } from './calendar-day-circle-helpers'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { test } from './upgrade-fixtures'

const today = new Date(LAYOUT_FIXED_TIME).toISOString().slice(0, 10)
function dateAtOffset(offset: number) {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
const scheduledDates = [-3, -2, -1, 0].map(dateAtOffset)
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: ['walk', 'read'].map((id) => makeHabitScheduleItem({ id, children: [], hasSubHabits: false, dueDate: scheduledDates[0], scheduledDates })),
  logs: {
    walk: [-2, -1, 0].map(dateAtOffset).map((date) => ({ id: `walk-${date}`, date, value: 1, createdAtUtc: `${date}T12:00:00Z` })),
    read: [-2, 0].map(dateAtOffset).map((date) => ({ id: `read-${date}`, date, value: 1, createdAtUtc: `${date}T12:00:00Z` })),
  },
})


async function expectHeaderGap(grid: Locator) {
  const gap = await grid.evaluate((grid) => {
    const header = grid.parentElement!.querySelector('[data-testid="month-grid-header"]')!.getBoundingClientRect()
    return grid.getBoundingClientRect().top - header.bottom
  })
  expect(gap).toBeCloseTo(8, 1)
}

for (const width of [320, 412, 600, 1352]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} calendar day circle at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { timeZone: 'UTC', weekStartDay: 1 } })
      test('keeps month, period and habit history paint inside their circles', async ({ page, context }) => {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, (route) => route.fulfill({ json: calendarMonth }))
        await page.goto('/calendar')
        const grid = page.locator('.orbit-calendar-grid-card [data-testid="month-grid-days"]')
        const current = grid.locator(`[data-calendar-date="${today}"]`)
        await expect(current.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
        await expectHeaderGap(grid)
        for (const date of scheduledDates) await expectDayCircle(grid.locator(`[data-calendar-date="${date}"]`), true, date === today, true)
        const monday = dateAtOffset(-4)
        const mondayInPreviousMonth = monday.slice(0, 7) !== today.slice(0, 7)
        if (mondayInPreviousMonth) await page.getByRole('button', { name: words.common.previousMonth, exact: true }).click()
        await expectDayCircle(grid.locator(`[data-calendar-date="${monday}"]`), true, false, true)
        if (mondayInPreviousMonth) await page.getByRole('button', { name: words.common.nextMonth, exact: true }).click()
        const partial = grid.locator(`[data-calendar-date="${dateAtOffset(-1)}"]`)
        await partial.getByRole('button').click()
        await expect(partial.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
        await expectDayCircle(partial, true, true, true)
        await expectDayCircle(current, true, true, true)
        await expectDayCircleHover(partial.getByRole('button'))
        await expectDayCircle(partial, true, true, true)
        await page.keyboard.press('Tab')
        await partial.getByRole('button').focus()
        await expectDayCircle(partial, true, true, true)
        await page.getByTestId('calendar-header-group').getByRole('radio', { name: words.calendar.view.range, exact: true }).click()
        const periodToday = grid.locator('[data-outcome][aria-current="date"]')
        await expect(periodToday).toBeVisible()
        await expectDayCircle(periodToday, true, true)
        await expectHeaderGap(grid)

        const habitId = 'walk'
        const habit = habitDetailSchema.parse({ ...makeHabitDetail(), id: habitId, createdAtUtc: `${dateAtOffset(-41)}T12:00:00Z` })
        const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [makeHabitScheduleItem({ id: habitId, children: [], hasSubHabits: false })], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
        const metrics = habitMetricsSchema.parse({ currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100, monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: today })
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list, (route) => route.fulfill({ json: habits }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: calendarMonth.logs.walk }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))
        await page.goto(`/habits/${habitId}`)
        const history = page.getByTestId('month-grid-days')
        const historyToday = history.locator('[data-outcome][aria-current="date"]')
        await expect(historyToday).toBeVisible()
        await expectDayCircle(historyToday, true, true)
        await expectHeaderGap(history)
      })

      for (const view of ['month', 'range'] as const) {
        test(`keeps ${view} loading circles in their loaded positions`, async ({ page, context }) => {
          let release!: () => void
          const ready = new Promise<void>((resolve) => { release = resolve })
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth, async (route) => { await ready; await route.fulfill({ json: calendarMonth }) })
          try {
            await page.goto('/calendar')
            await page.getByTestId('calendar-header-group').getByRole('radio', { name: words.calendar.view[view], exact: true }).click()
            const grid = page.locator('.orbit-calendar-grid-card [data-testid="month-grid-days"]')
            const placeholders = grid.locator('[data-variant="grid"]')
            await expect(placeholders.first()).toBeVisible()
            await expectHeaderGap(grid)
            for (const placeholder of await placeholders.all()) await expectDayCircle(placeholder, false)
            const before = await grid.evaluate((grid) => [...grid.children].map((slot) => {
              const box = slot.querySelector('[data-variant="grid"] span')!.getBoundingClientRect()
              return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }
            }))
            release()
            await expect(placeholders).toHaveCount(0)
            const after = await grid.evaluate((grid) => [...grid.children].flatMap((slot, index) => {
              const box = slot.querySelector('[data-day-circle]')?.getBoundingClientRect()
              return box ? [{ index, x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }] : []
            }))
            expect(after.length).toBeGreaterThanOrEqual(14)
            for (const box of after) for (const dimension of ['x', 'y', 'width', 'height'] as const) expect(box[dimension]).toBeCloseTo(before[box.index]![dimension], 1)
          } finally { release() }
        })
      }
    })
  }
}

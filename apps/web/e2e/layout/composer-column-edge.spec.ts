import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { measureScrollbarGutter } from './scrollbar-geometry'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const today = '2026-09-04'
const habit = habitDetailSchema.parse(makeHabitDetail())
const schedules = Array.from({ length: 20 }, (_, position) => makeHabitScheduleItem({
  id: position === 0 ? habit.id : `habit-column-${position}`, title: `Read ${position + 1}`,
  position, scheduledDates: [today], children: [], hasSubHabits: false,
}))
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: schedules, page: 1, pageSize: 200, totalCount: schedules.length, totalPages: 1,
})
const metrics = habitMetricsSchema.parse({
  currentStreak: 1, longestStreak: 1, weeklyCompletionRate: 100,
  monthlyCompletionRate: 100, totalCompletions: 1, lastCompletedDate: null,
})

async function expectRightEdge(surface: Locator, rowRight: number) {
  await expect(surface).toBeVisible()
  await expect(async () => {
    const right = await surface.evaluate((element) => element.getBoundingClientRect().right)
    expect(Math.abs(right - rowRight)).toBeLessThanOrEqual(0.5)
  }).toPass({ timeout: 5000 })
}

for (const width of [600, 1100]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const atLimit of [false, true]) {
      test.describe(`composer column edge at ${width}px in ${locale} with limit ${atLimit}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 },
          layoutProfile: atLimit ? { aiMessagesUsed: 5, aiMessagesLimit: 5 } : {} })
        const words = locale === 'en' ? en : ptBR

        test('keeps Hoje and habit detail on the habit column edge', async ({ page, context }) => {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
            (route) => route.fulfill({ json: habits }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: schedules.length + habit.children.length } }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habit.id)}`, (route) => route.fulfill({ json: [] }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habit.id)}`, (route) => route.fulfill({ json: metrics }))
          await page.goto('/')
          await expect(page.getByTestId('habit-row')).toHaveCount(schedules.length)
          const row = page.getByTestId('habit-row').first()
          await expect(row).toBeVisible()
          expect(await page.locator('[data-shell-scroller]').evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
          await page.evaluate(() => document.fonts.ready)
          const rowRight = await row.evaluate((element) => element.getBoundingClientRect().right)

          for (const path of ['/', `/habits/${habit.id}`]) {
            if (path !== '/') {
              await page.goto(path)
              await expect(page.locator('[data-habit-detail-content] h1')).toHaveText(habit.title)
              await page.evaluate(() => document.fonts.ready)
            }
            const scroller = page.locator('[data-shell-scroller]')
            expect(await scroller.evaluate(measureScrollbarGutter)).toBeGreaterThan(0)
            const composer = page.locator('[data-shell-pinned-slot] [data-composer-root]')
            await expect(composer).toHaveAttribute('data-state', atLimit ? 'atLimit' : 'idle')
            await expectRightEdge(composer.locator('[data-composer-input-row]'), rowRight)
            if (atLimit) {
              const reason = words.shell.composer.limit.reason.replace('{allowance}', '5')
              await expectRightEdge(composer.getByText(reason, { exact: true }), rowRight)
            }
          }
        })
      })
    }
  }
}

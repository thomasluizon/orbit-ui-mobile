import { setLayoutFixtureSession } from './profile-session'
import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { measureScrollbarGutter } from './scrollbar-geometry'
import { measureChromePaint } from './composer-column-paint'

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

for (const width of [320, 1280]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`hosted notice paint at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      const words = locale === 'en' ? en : ptBR

      test('keeps the toast shadow inside the native gutter clip and Undo reachable', async ({ page, context }) => {
        const notification = createMockNotification({ title: 'Column notice' })
        const notifications = notificationsResponseSchema.parse({ items: [notification], unreadCount: 1 })
        await context.route(`${LAYOUT_ORIGIN}${API.notifications.list}`, (route) => route.fulfill({ json: notifications }))
        await page.goto('/notifications')
        await page.getByRole('button', {
          name: words.notifications.deleteNotification.replace('{title}', notification.title), exact: true,
        }).click()
        const toast = page.locator('[data-shell-notice] [data-kind="neutral"]')
          .filter({ hasText: words.notifications.deleteQueued })
        await expect(toast).toBeVisible()
        await page.clock.pauseAt(new Date(`${today}T12:00:00Z`))
        await page.evaluate(() => document.fonts.ready)
        const scroller = page.locator('[data-shell-scroller]')
        const gutter = await scroller.evaluate(measureScrollbarGutter)
        expect(gutter).toBeGreaterThan(0)
        const paint = await toast.evaluate(measureChromePaint)
        expect(paint.extent.top).toBeGreaterThan(0)
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
          expect(paint.clearance[side], `${side} shadow clearance`).toBeGreaterThanOrEqual(paint.extent[side] - 0.5)
        }
        expect(paint.clipPointerEvents).toBe('none')
        const edges = await toast.evaluate((element, gutter) => {
          const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
          const bounds = element.getBoundingClientRect()
          return { left: bounds.left - column.left, right: column.right - gutter - bounds.right }
        }, gutter)
        expect(edges.left).toBeCloseTo(16, 1)
        expect(edges.right).toBeCloseTo(16, 1)
        await toast.getByRole('button', { name: words.notifications.deleteUndo, exact: true }).click()
        await expect(toast).toHaveCount(0)
        await expect(page.getByText(notification.title, { exact: true })).toBeVisible()
        const slot = page.locator('[data-shell-notice]')
        await expect.poll(() => slot.evaluate((element) => element.getBoundingClientRect().height), { timeout: 3000 }).toBe(0)
      })
    })
  }
}

for (const width of [600, 1100]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const atLimit of [false, true]) {
      test.describe(`composer column edge at ${width}px in ${locale} with limit ${atLimit}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 },
          layoutProfile: atLimit ? { aiMessagesUsed: 5, aiMessagesLimit: 5 } : {} })
        const words = locale === 'en' ? en : ptBR

        test('keeps Hoje and habit detail on the habit column edge', async ({ page, context }) => {
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
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

          if (width >= 1024) await expect(page.locator('[data-shell-pinned-slot] [data-composer-root]')).toHaveCount(0)
          for (const path of width < 1024 ? ['/', `/habits/${habit.id}`] : [`/habits/${habit.id}`]) {
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

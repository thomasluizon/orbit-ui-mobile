import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { logSmokeHabit } from '../support/smoke-adapters'
import { LAYOUT_ORIGIN } from '../support/env'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const selectedDate = LAYOUT_FIXED_TIME.slice(0, 10)

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [412, 1280]) {
    test.describe(`smoke log response latency in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('reads the completed row after the response outlasts its visibility window', async ({ page, context }) => {
        const habit = makeHabitScheduleItem({
          id: 'smoke-latency-habit', title: 'Smoke log latency',
          children: [], hasSubHabits: false, tags: [], dueDate: selectedDate,
          frequencyUnit: null, frequencyQuantity: null, scheduledDates: [selectedDate],
        })
        const completed = habitScheduleItemSchema.parse({
          ...habit, scheduledDates: [], isLoggedInRange: true,
          instances: [{ date: selectedDate, status: 'Completed', logId: 'layout-log' }],
        })
        await setLayoutFixtureSession(context, [{
          path: API.habits.list,
          body: { ...emptyHabitsPageFixture, items: [habit], totalCount: 1 },
        }])
        let logResponses = 0
        await page.route(`${LAYOUT_ORIGIN}/`, async (route) => {
          const request = route.request()
          if (request.method() !== 'POST' || !('next-action' in request.headers()) ||
              !request.postData()?.startsWith(`["${habit.id}",`)) return route.continue()
          const response = await route.fetch()
          await setLayoutFixtureSession(context, [{
            path: API.habits.list,
            body: { ...emptyHabitsPageFixture, items: [completed], totalCount: 1 },
          }])
          await new Promise<void>((resolve) => setTimeout(resolve, 2200))
          logResponses += 1
          await route.fulfill({ response })
        })
        await page.goto('/')
        await logSmokeHabit(page, habit.title)
        expect(logResponses).toBe(1)
        await expect(page.locator(`[data-habit-title="${habit.title}"]`)).toHaveAttribute('data-status', 'done')
      })
    })
  }
}

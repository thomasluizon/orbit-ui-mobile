import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const habits = { ...emptyHabitsPageFixture, totalCount: 1, items: [makeHabitScheduleItem({ id: 'walk', title: 'Walk', children: [], hasSubHabits: false })] }

test.describe('hydration guard under a slow CPU', () => {
  test.use({ appLocale: 'en', viewport: { width: 1280, height: 915 } })

  test('opens habit search with the first click after a slow hydration', async ({ page, context }) => {
    await setLayoutFixtureSession(context, [
      { path: API.habits.list, body: habits },
      { path: API.habits.count, body: { count: 1 } },
    ])
    const session = await context.newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
    await page.goto('/')
    await page.getByRole('button', { name: en.habits.search.title, exact: true }).click()
    await expect(page.getByRole('textbox', { name: en.habits.search.question, exact: true })).toBeFocused()
  })
})

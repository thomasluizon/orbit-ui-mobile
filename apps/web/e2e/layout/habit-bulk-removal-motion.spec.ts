import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { test } from './layout-test'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`bulk skip retains every row and the scrolled viewport with ${reducedMotion}`, async ({ page, context }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    await page.emulateMedia({ reducedMotion })
    const date = '2026-09-04'
    const items = Array.from({ length: 30 }, (_, index) => makeHabitScheduleItem({
      id: `skip-${index}`, title: `Habit ${index}`, position: index, dueDate: date, scheduledDates: [date],
      children: [], hasSubHabits: false,
    }))
    const profile = profileSchema.parse({ ...profileFixture, language: 'en', timeZone: 'UTC' })
    await setLayoutProfileSession(context, profile)
    await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile },
      { path: API.habits.count, body: { count: items.length } },
      { path: API.habits.list, body: { ...emptyHabitsPageFixture, items, totalCount: items.length },
        afterMutation: { method: 'POST', path: API.habits.bulkSkip, body: emptyHabitsPageFixture } }])
    await page.goto('/')
    const rows = page.locator('[data-testid="habit-row"]')
    await expect(rows).toHaveCount(items.length)
    await rows.first().locator('[data-habit-row-control="menu"]').click()
    await page.getByRole('menuitem', { name: en.common.select, exact: true }).click()
    await page.getByRole('button', { name: en.common.selectAll, exact: true }).click()
    const scroller = page.locator('[data-shell-scroller]')
    await scroller.evaluate((element) => { element.scrollTop = 650 })
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(650)
    const observations = scroller.evaluate((element) => new Promise<{ departures: number; offsets: number[] }>((resolve) => {
      const offsets: number[] = []
      let departures = 0
      const sample = () => {
        offsets.push(element.scrollTop)
        departures = Math.max(departures, element.querySelectorAll('[data-list-motion][inert] [data-testid="habit-row"]').length)
        if (departures > 0 && element.querySelectorAll('[data-testid="habit-row"]').length === 0) resolve({ departures, offsets })
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }))
    await page.getByRole('button', { name: en.habits.bulkBar.skip, exact: true }).click()
    const observed = await observations
    expect(observed.departures).toBe(items.length)
    expect(observed.offsets.every((offset) => Math.abs(offset - 650) < 1), JSON.stringify(observed)).toBe(true)
    await expect(rows).toHaveCount(0)
  })
}

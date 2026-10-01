import { test, expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession } from './profile-session'

const selectedDate = '2026-09-04'
const children = [0, 1].map((position) => makeHabitScheduleItem({
  id: `child-${position}`, title: `Child ${position}`, position,
  children: [], hasSubHabits: false, scheduledDates: [selectedDate],
}))
const items = [
  makeHabitScheduleItem({ id: 'parent', title: 'Parent', children, scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'timed', title: 'Timed', children: [], hasSubHabits: false,
    position: 1, dueTime: '21:00', scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'untimed', title: 'Untimed', children: [], hasSubHabits: false,
    position: 2, scheduledDates: [selectedDate] }),
]

for (const mode of ['dark', 'light'] as const) {
  for (const width of [412, 1280]) {
    test(`Hoje rows keep drawn geometry and parent contrast at ${width}px in ${mode}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 915 })
      const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'pt-BR' })
      await setLayoutProfileSession(context, profile)
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.list,
        (route) => route.fulfill({ json: { ...emptyHabitsPageFixture, items, totalCount: items.length } }))
      await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: 5 } }))
      await page.clock.setFixedTime(new Date(`${selectedDate}T12:00:00Z`))
      await page.goto('/')
      const parent = page.getByTestId('habit-row').filter({ hasText: 'Parent' })
      const disclosure = parent.locator('[data-habit-row-control="disclosure"]')
      await expect(disclosure).toBeVisible()
      if (await disclosure.getAttribute('aria-expanded') === 'true') await disclosure.click()
      await expect(parent).toContainText('0 de 2')
      const panels = page.locator('.habit-panel')
      await expect(panels).toHaveCount(3)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await panels.evaluateAll((elements) => elements.map((panel) => {
        const row = panel.querySelector('[data-testid="habit-row"]')!
        const well = row.querySelector('[data-habit-row-body] > span')!
        const bounds = panel.getBoundingClientRect()
        const wellBounds = well.getBoundingClientRect()
        const track = row.querySelector('circle')
        return {
          height: bounds.height, above: wellBounds.top - bounds.top, below: bounds.bottom - wellBounds.bottom,
          track: track ? getComputedStyle(track).stroke : null,
          card: getComputedStyle(panel).backgroundColor,
          canvas: getComputedStyle(document.body).backgroundColor,
        }
      }))
      for (const panel of geometry) {
        expect(panel.height).toBe(68)
        expect(panel.above).toBeCloseTo(panel.below, 1)
      }
      const parentTrack = geometry.find((panel) => panel.track !== null)!
      expect(parentTrack.track).toBe(mode === 'dark' ? 'rgb(122, 122, 125)' : 'rgb(127, 127, 131)')
      expect(contrastOnSurface(parentTrack.track!, [parentTrack.canvas, parentTrack.card])).toBeGreaterThanOrEqual(3)
    })
  }
}

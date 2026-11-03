import { API } from '@orbit/shared/api'
import { getAccountDay } from '@orbit/shared/utils'
import { SPACING } from '@orbit/shared/theme'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { expect } from '@playwright/test'
import { setLayoutFixtureSession } from './profile-session'
import { measureShellScrollEnd, shellScrollViewports } from './shell-scroll-extent'
import { test } from './upgrade-fixtures'

for (const viewport of shellScrollViewports) {
  test.describe(`Hoje end of list at ${viewport.width} by ${viewport.height}`, () => {
    test.use({ appLocale: 'en', viewport })

    test('stops at the last row and shell clearance', async ({ page, context }) => {
      const date = getAccountDay(new Date(), 'UTC')
      const items = Array.from({ length: 32 }, (_, index) => makeHabitScheduleItem({
        id: `scroll-extent-${index}`, title: `Read chapter ${index}`, position: index,
        dueDate: date, scheduledDates: [date], children: [], hasSubHabits: false,
      }))
      const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
        items, page: 1, pageSize: items.length, totalCount: items.length, totalPages: 1,
      })
      await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
      await page.goto('/')
      const scroller = page.locator('[data-shell-scroller]')
      await expect(scroller.locator('[data-testid="habit-row"]')).toHaveCount(items.length)
      await page.evaluate(() => document.fonts.ready)
      const measured = await scroller.evaluate(measureShellScrollEnd)
      const clearance = viewport.width >= 1024 ? SPACING.s32 : SPACING.s96
      expect(measured.scrollTop).toBeGreaterThan(0)
      expect(measured.scrollTop).toBe(measured.scrollHeight - measured.clientHeight)
      expect(measured.lastTop).toBeGreaterThanOrEqual(measured.scrollerTop)
      expect(measured.scrollerBottom - measured.lastBottom).toBeCloseTo(clearance, 0)
      if (viewport.width < 1024) {
        const divider = (await page.locator('[data-composer-root]').boundingBox())!
        expect(divider.y - measured.lastBottom).toBeCloseTo(clearance, 0)
      }
    })
  })
}

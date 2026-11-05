import en from '@orbit/shared/i18n/en.json'
import { API } from '@orbit/shared/api'
import { getAccountDay } from '@orbit/shared/utils'
import { SPACING } from '@orbit/shared/theme'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { expect } from '@playwright/test'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { measureShellScrollEnd, shellScrollViewports } from './shell-scroll-extent'
import { test } from './layout-test'

for (const viewport of shellScrollViewports) {
  test.describe(`Hoje end of list at ${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport })

    test('stops at the last row and shell clearance', async ({ page, context }, testInfo) => {
      const date = getAccountDay(new Date(LAYOUT_FIXED_TIME), 'UTC')
      const items = Array.from({ length: 32 }, (_, index) => makeHabitScheduleItem({
        id: `scroll-extent-${index}`, title: `Read chapter ${index}`, position: index,
        dueDate: date, scheduledDates: [date], children: [], hasSubHabits: false,
      }))
      const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
        items, page: 1, pageSize: items.length, totalCount: items.length, totalPages: 1,
      })
      const profile = profileSchema.parse({ ...profileFixture, language: 'en', timeZone: 'UTC' })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile },
        { path: API.habits.count, body: { count: items.length } },
        { path: API.habits.list, body: habits,
        afterMutation: { method: 'POST', path: API.habits.bulkSkip, body: { ...habits, items: items.slice(10), totalCount: items.length - 10 } } }])
      await page.goto('/')
      const scroller = page.locator('[data-shell-scroller]')
      await expect(scroller.locator('[data-testid="habit-row"]')).toHaveCount(items.length)
      await page.evaluate(() => document.fonts.ready)
      const measured = await scroller.evaluate(measureShellScrollEnd)
      await testInfo.attach('initial-scroll-extent', { body: JSON.stringify({ ...viewport, ...measured }), contentType: 'application/json' })
      const button = (await page.locator('[data-astra-button]').boundingBox())!
      const clearance = Math.max(viewport.width >= 1024 ? SPACING.s32 : SPACING.s96, measured.scrollerBottom - button.y + SPACING.s16)
      expect(measured.scrollTop).toBeGreaterThan(0)
      expect(measured.scrollTop).toBe(measured.scrollHeight - measured.clientHeight)
      expect(measured.lastTop).toBeGreaterThanOrEqual(measured.scrollerTop)
      expect(measured.scrollerBottom - measured.lastBottom).toBeCloseTo(clearance, 0)
      await scroller.locator('[data-habit-row-control="menu"]').first().click()
      await page.getByRole('menuitem', { name: en.common.select, exact: true }).click()
      for (let index = 0; index < 9; index++) {
        const control = page.locator('[data-habit-row-control="selection"][aria-pressed="false"]').first()
        await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
        await control.click()
      }
      await scroller.evaluate(measureShellScrollEnd)
      await page.getByRole('button', { name: en.habits.bulkBar.skip, exact: true }).click()
      await expect(scroller.locator('[data-testid="habit-row"]')).toHaveCount(items.length - 10)
      const afterRemoval = await scroller.evaluate(measureShellScrollEnd)
      await testInfo.attach('settled-scroll-extent', { body: JSON.stringify({ ...viewport, ...afterRemoval }), contentType: 'application/json' })
      expect(afterRemoval.lastTop).toBeGreaterThanOrEqual(afterRemoval.scrollerTop)
      const restoredButton = (await page.locator('[data-astra-button]').boundingBox())!
      const restoredClearance = Math.max(viewport.width >= 1024 ? SPACING.s32 : SPACING.s96, afterRemoval.scrollerBottom - restoredButton.y + SPACING.s16)
      expect(afterRemoval.scrollerBottom - afterRemoval.lastBottom).toBeCloseTo(restoredClearance, 0)
      expect(restoredButton.y - afterRemoval.lastBottom).toBeGreaterThanOrEqual(SPACING.s16 - 1)
      if (viewport.width < 1024) {
        const tabs = (await page.locator('[data-shell-tab-bar]').boundingBox())!
        expect(tabs.y - afterRemoval.lastBottom).toBeCloseTo(restoredClearance, 0)
      }
    })
  })
}

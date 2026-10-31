import { expect, type Page } from '@playwright/test'
import { createTranslator } from 'next-intl'
import { API } from '@orbit/shared/api'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import { openTodayListOptions } from './hydration-guard'
import { LAYOUT_FIXED_TIME } from './clock.mjs'

const day = LAYOUT_FIXED_TIME.slice(0, 10)
const child = makeHabitScheduleItem().children[0]!
const children = [
  { ...child, id: 'future', title: 'Future child', dueDate: '2027-01-01', scheduledDates: [], position: 0 },
  { ...child, id: 'undated', title: 'Undated child', frequencyUnit: null, frequencyQuantity: null, isGeneral: true, scheduledDates: [], position: 1 },
  { ...child, id: 'done-once', title: 'Completed task', frequencyUnit: null, frequencyQuantity: null, isCompleted: true, scheduledDates: [], position: 2 },
  { ...child, id: 'recurring', title: 'Completed recurring', scheduledDates: [day], isLoggedInRange: true,
    instances: [{ date: day, status: 'Completed' as const, logId: 'drill-log' }], position: 3 },
]
const parent = makeHabitScheduleItem({ title: 'General', dueDate: day, scheduledDates: [day], position: 30, children })
const items = [
  ...Array.from({ length: 24 }, (_, index) => makeHabitScheduleItem({
    id: `root-${index}`, title: `Root ${index}`, dueDate: day, scheduledDates: [day], position: index, children: [], hasSubHabits: false,
  })), parent,
]
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items, page: 1, pageSize: 200, totalCount: items.length, totalPages: 1 })
const detail = habitDetailSchema.parse({ ...makeHabitDetail(), ...parent })

function habitRow(page: Page, title: string) {
  return page.locator('[data-habit-title]').filter({ has: page.locator('[data-personal-text]', { hasText: title }) })
}

for (const width of [320, 412, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`sub-habit drill at ${width} in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('opens at the top with clear back fill and every date', async ({ page, context }) => {
        const t = createTranslator({ locale, messages: words })
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
        await context.route((url) => url.pathname === API.habits.get(parent.id), (route) => route.fulfill({ json: detail }))
        await page.goto(`/?date=${day}`)
        await habitRow(page, parent.title).locator('[data-habit-row-control="menu"]').click()
        const scroller = page.locator('[data-shell-scroller]')
        expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        await page.getByRole('menu', { name: parent.title, exact: true })
          .getByRole('menuitem', { name: words.habits.actions.openSubHabits, exact: true }).click()
        const header = page.locator('[data-habit-drill-header]')
        const title = header.getByRole('heading', { name: parent.title, exact: true })
        const back = header.getByRole('button', { name: words.common.back, exact: true })
        await expect(title).toBeInViewport()
        await expect(back).toBeInViewport()
        await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0)
        for (const controlState of ['hover', 'focus'] as const) {
          if (controlState === 'hover') await back.hover()
          else await back.focus()
          const buttonBounds = await back.boundingBox()
          const titleBounds = await title.boundingBox()
          expect(titleBounds!.x - buttonBounds!.x - buttonBounds!.width).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
        }
        for (const item of [children[0]!, children[1]!, children[3]!]) await expect(habitRow(page, item.title)).toBeVisible()
        await expect(habitRow(page, children[2]!.title)).toHaveCount(0)
        await expect(header).toContainText(t('habits.drillProgress', { done: 1, total: 3 }))
        await openTodayListOptions(page, words.habits.listOptions)
        await page.getByRole('menuitem', { name: words.habits.showCompletedMenu, exact: true }).click()
        await expect(habitRow(page, children[2]!.title)).toBeVisible()
        await expect(header).toContainText(t('habits.drillProgress', { done: 1, total: 4 }))
      })
    })
  }
}

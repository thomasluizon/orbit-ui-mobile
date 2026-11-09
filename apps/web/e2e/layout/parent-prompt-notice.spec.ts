import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { buildOptimisticSkipPatch, optimisticPatchHabit } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'
import { clickWhenHydrated } from './hydration-guard'

const date = LAYOUT_FIXED_TIME.slice(0, 10)
const child = createMockHabitScheduleChild({ id: 'notice-child', title: 'Child', dueDate: date, scheduledDates: [date] })
const parent = createMockHabitScheduleItem({ id: 'notice-parent', title: 'Parent', dueDate: date, scheduledDates: [date], hasSubHabits: true, children: [child] })
const skipped = optimisticPatchHabit([parent], child.id, buildOptimisticSkipPatch(child, date))
const pageSchema = createPaginatedSchema(habitScheduleItemSchema)
const pageOf = (items: typeof skipped) => pageSchema.parse({ items, page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })

for (const width of [412, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`Parent notice at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, contextOptions: { reducedMotion: 'reduce' } })
      for (const dismissal of ['cancel', 'confirm', 'close', 'escape'] as const) {
        test(`returns child undo to the shell after ${dismissal}`, async ({ page, context }) => {
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: pageOf([parent]),
            afterMutation: { method: 'POST', path: API.habits.skip(child.id), body: pageOf(skipped) },
          }])
          await page.goto('/')
          const parentRow = page.locator('[data-habit-title="Parent"]')
          const disclosure = parentRow.locator('[data-habit-row-control="disclosure"]')
          if (await disclosure.getAttribute('aria-expanded') !== 'true') await clickWhenHydrated(disclosure)
          await page.locator('[data-habit-title="Child"] [data-habit-row-control="menu"]').click()
          await page.getByRole('menuitem', { name: words.habits.actions.skip, exact: true }).click()
          const dialog = page.getByRole('dialog', { name: words.habits.autoSkipParentTitle, exact: true })
          await expect(dialog).toBeVisible()
          await expect(page.locator('[data-kind]')).toHaveCount(0)
          await page.clock.pauseAt(new Date(LAYOUT_FIXED_TIME))
          await page.clock.runFor(20000)
          await expect(page.locator('[data-kind]')).toHaveCount(0)
          if (dismissal === 'escape') await page.keyboard.press('Escape')
          else await dialog.getByRole('button', { name: { cancel: words.common.notNow, confirm: words.habits.autoSkipParentConfirm, close: words.common.close }[dismissal], exact: true }).click()
          await page.clock.runFor(100)
          await expect(dialog).toHaveCount(0)
          const notice = page.locator('[data-shell-notice-content] [data-kind]')
          await expect(notice).toBeVisible()
          await expect(notice.getByRole('button', { name: words.undo.action, exact: true })).toBeVisible()
          const noticeBounds = await notice.boundingBox()
          const slotBounds = await page.locator('[data-shell-notice-content]').boundingBox()
          expect(noticeBounds!.x).toBeGreaterThanOrEqual(slotBounds!.x)
          expect(noticeBounds!.x + noticeBounds!.width).toBeLessThanOrEqual(slotBounds!.x + slotBounds!.width + 1)
          await page.clock.runFor(4800)
          await expect(notice).toBeVisible()
        })
      }
    })
  }
}

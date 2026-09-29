import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { test } from './upgrade-fixtures'

const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Beber água',
  dueDate: '2026-09-03',
  scheduledDates: ['2026-09-03'],
  children: [],
  hasSubHabits: false,
}))
const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit],
  page: 1,
  pageSize: 200,
  totalCount: 1,
  totalPages: 1,
})

for (const width of [412, 1280] as const) {
  test.describe(`menu rows at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('keeps habit and list menu rows at their presentation height', async ({ page, context }) => {
      await context.route(new RegExp(`${API.habits.list}[?]`),
        (route) => route.fulfill({ json: habitsPage }))
      await page.goto('/?date=2026-09-03')
      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      await page.getByRole('menu', { name: ptBr.habits.listOptions })
        .getByRole('menuitem', { name: ptBr.habits.refresh }).click()

      const row = page.locator('[data-habit-title="Beber água"]')
      await expect(row).toBeVisible()
      await row.locator('[data-habit-row-control="menu"]').click()

      const menu = page.getByRole('menu', { name: ptBr.habits.actions.more })
      await expect(menu).toBeVisible()
      const items = menu.getByRole('menuitem')
      expect(await items.count()).toBeGreaterThan(0)
      for (const item of await items.all()) {
        await expect(item).toHaveCSS('height', width === 412 ? '56px' : '44px')
      }
      const destructive = items.last()
      await expect(destructive).toHaveAttribute('data-destructive')
      await expect(destructive).toHaveCSS('border-top-width', '1px')

      if (width === 412) {
        await page.locator('.orbit-sheet-close').click()
      } else {
        await page.keyboard.press('Escape')
      }

      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      const listMenu = page.getByRole('menu', { name: ptBr.habits.listOptions })
      await expect(listMenu).toBeVisible()
      for (const item of await listMenu.getByRole('menuitem').all()) {
        await expect(item).toHaveCSS('height', width === 412 ? '56px' : '44px')
      }
    })
  })
}

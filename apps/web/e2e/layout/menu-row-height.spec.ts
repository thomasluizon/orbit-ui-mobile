import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession } from './profile-session'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { resolveWebThemeVariables } from '../../lib/theme-dom'
import { LAYOUT_ORIGIN } from '../support/env'
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

for (const { width, mode } of [412, 1280].flatMap((width) =>
  (['dark', 'light'] as const).map((mode) => ({ width, mode })))) {
  test.describe(`menu rows at ${width}px in ${mode}`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('keeps habit and list menu rows at their presentation height', async ({ page, context }) => {
      await context.route(new RegExp(`${API.habits.list}[?]`),
        (route) => route.fulfill({ json: habitsPage }))
      const profile = profileSchema.parse({
        ...profileFixture, themePreference: mode, language: 'pt-BR',
      })
      await setLayoutProfileSession(context, profile)
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`,
        (route) => route.fulfill({ json: profile }))
      await page.goto('/?date=2026-09-03')
      await expect(page.locator('html')).toHaveClass(new RegExp(mode))
      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      await page.getByRole('menu', { name: ptBr.habits.listOptions })
        .getByRole('menuitem', { name: ptBr.habits.refresh }).click()

      const row = page.locator('[data-habit-title="Beber água"]')
      await expect(row).toBeVisible()
      await row.locator('[data-habit-row-control="menu"]').click()

      const menu = page.getByRole('menu', { name: habit.title })
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: ptBr.habits.actions.moveUnder })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: ptBr.habits.actions.delete })).toBeVisible()
      const items = menu.getByRole('menuitem')
      expect(await items.count()).toBeGreaterThan(0)
      for (const item of await items.all()) {
        await expect(item).toHaveCSS('height', width === 412 ? '56px' : '48px')
      }
      const destructive = items.last()
      await expect(destructive).toHaveAttribute('data-destructive')
      await expect(destructive).toHaveCSS('border-top-width', '1px')
      const icon = destructive.locator('svg')
      const label = destructive.locator('.orbit-menu-label')
      const iconColour = await icon.evaluate((element) => getComputedStyle(element).color)
      const labelColour = await label.evaluate((element) => getComputedStyle(element).color)
      const restingFill = await destructive.evaluate((element) => getComputedStyle(element).backgroundColor)
      await destructive.hover()
      const hoverFill = resolveWebThemeVariables('orange', mode)['--bg-hover']!.replace(/\s*,\s*/g, ', ')
      await expect(destructive).toHaveCSS('background-color', hoverFill)
      await expect(icon).toHaveCSS('color', iconColour)
      await expect(label).toHaveCSS('color', labelColour)
      await expect(destructive).not.toHaveCSS('background-color', restingFill)
      await expect(destructive).toHaveCSS('transform', 'none')
      await page.mouse.down()
      await destructive.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
      await expect(destructive).toHaveCSS('background-color', hoverFill)
      await expect(icon).toHaveCSS('color', iconColour)
      await expect(label).toHaveCSS('color', labelColour)
      await expect(destructive).toHaveCSS('transform', 'none')
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await expect(page.getByRole('status').filter({ hasText: 'Draggable item' })).toHaveCount(0)

      if (width === 412) {
        await page.locator('.orbit-sheet-close').click()
      } else {
        await page.keyboard.press('Escape')
      }
      await expect(menu).toHaveCount(0)

      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      const listMenu = page.getByRole('menu', { name: ptBr.habits.listOptions })
      await expect(listMenu).toBeVisible()
      for (const item of await listMenu.getByRole('menuitem').all()) {
        await expect(item).toHaveCSS('height', width === 412 ? '56px' : '48px')
      }
    })
  })
}

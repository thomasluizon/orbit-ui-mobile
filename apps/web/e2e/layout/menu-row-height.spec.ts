import { openTodayListOptions } from './hydration-guard'
import { settleAnimations } from './settle-animations'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { resolveWebThemeVariables } from '../../lib/theme-dom'
import { restPointerOutside } from './pointer-rest'
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
      await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habitsPage }])
      const profile = profileSchema.parse({
        ...profileFixture, themePreference: mode, language: 'pt-BR',
      })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
      await page.goto('/?date=2026-09-03')
      await expect(page.locator('html')).toHaveClass(new RegExp(mode))
      await openTodayListOptions(page, ptBr.habits.listOptions)
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
      await restPointerOutside(menu)
      await expect(destructive).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
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
      await destructive.evaluate(settleAnimations)
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

      await openTodayListOptions(page, ptBr.habits.listOptions)
      const listMenu = page.getByRole('menu', { name: ptBr.habits.listOptions })
      await expect(listMenu).toBeVisible()
      for (const item of await listMenu.getByRole('menuitem').all()) {
        await expect(item).toHaveCSS('height', width === 412 ? '56px' : '48px')
      }
    })
  })
}

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`habit overflow in short landscape with enlarged ${locale} text`, () => {
    test.use({ appLocale: locale, viewport: { width: 915, height: 412 } })

    test('scrolls every management action into pointer and keyboard reach', async ({ page, context }) => {
      const words = locale === 'en' ? en : ptBr
      const profile = profileSchema.parse({ ...profileFixture, language: locale })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [
        { path: API.profile.get, body: profile },
        { path: API.habits.list, body: habitsPage },
      ])
      await page.goto('/?date=2026-09-03')
      await openTodayListOptions(page, words.habits.listOptions)
      await page.getByRole('menuitem', { name: words.habits.refresh, exact: true }).click()
      const row = page.locator('[data-habit-title="Beber água"]')
      await expect(row).toBeVisible()
      await page.locator('html').evaluate((root) => { root.style.fontSize = '200%' })
      await row.locator('[data-habit-row-control="menu"]').click()
      const menu = page.getByRole('menu', { name: habit.title })
      await expect(menu).toBeVisible()
      await menu.evaluate(settleAnimations)
      const bounds = (await menu.boundingBox())!
      expect(bounds.y).toBeGreaterThanOrEqual(8)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(404)
      expect(await menu.evaluate((panel) => panel.scrollHeight > panel.clientHeight)).toBe(true)
      const items = menu.getByRole('menuitem')
      await expect(items).toHaveText([
        words.habits.actions.addSubHabit, words.habits.actions.moveUnder, words.habits.actions.skip,
        words.common.edit, words.habits.actions.duplicate, words.common.select, words.habits.actions.delete,
      ])
      for (const item of await items.all()) {
        await item.scrollIntoViewIfNeeded()
        await item.hover()
        const reachable = await item.evaluate((element) => {
          const rectangle = element.getBoundingClientRect()
          const hit = document.elementFromPoint(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2)
          return rectangle.top >= 8 && rectangle.bottom <= innerHeight - 8 && (hit === element || element.contains(hit))
        })
        expect(reachable).toBe(true)
      }
      await page.mouse.move(0, 0)
      for (const [index, item] of (await items.all()).entries()) {
        await page.keyboard.press(index === 0 ? 'Home' : 'ArrowDown')
        await expect(item).toBeFocused()
        const rectangle = (await item.boundingBox())!
        expect(rectangle.y).toBeGreaterThanOrEqual(8)
        expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(404)
      }
      await menu.getByRole('menuitem', { name: words.common.select, exact: true }).click()
      await expect(page.getByTestId('bulk-action-bar')).toBeVisible()
      await expect(menu).toHaveCount(0)
    })
  })
}

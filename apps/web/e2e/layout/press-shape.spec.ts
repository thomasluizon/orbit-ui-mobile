import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { test } from './upgrade-fixtures'

const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Beber água',
  dueDate: '2026-09-04',
  scheduledDates: ['2026-09-04'],
  children: [],
  hasSubHabits: false,
}))
const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})
const calendarMonth = calendarMonthResponseSchema.parse({ habits: [habit], logs: {} })

async function readHitBoxOnceStill(control: Locator) {
  await expect(async () => {
    await control.scrollIntoViewIfNeeded()
    const first = await control.boundingBox()
    await control.page().waitForTimeout(250)
    expect(await control.boundingBox()).toEqual(first)
  }).toPass()
  return control.boundingBox()
}

async function expectHoverOnHitArea(control: Locator, radius: 'pill' | 8 | 12 | 20) {
  await expect(control).toBeVisible()
  const hitBox = await readHitBoxOnceStill(control)
  expect(hitBox).not.toBeNull()
  const restingBackground = await control.evaluate((element) => getComputedStyle(element).backgroundColor)
  await control.hover()
  const painted = await control.evaluate((element) => {
    for (const animation of element.getAnimations()) animation.finish()
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      radius: Math.min(Number.parseFloat(style.borderTopLeftRadius), rect.width / 2, rect.height / 2),
    }
  })
  expect(painted.background, 'the hit-area element owns the hover fill').not.toBe(restingBackground)
  expect(painted.x).toBeCloseTo(hitBox!.x, 1)
  expect(painted.y).toBeCloseTo(hitBox!.y, 1)
  expect(painted.width).toBeCloseTo(hitBox!.width, 1)
  expect(painted.height).toBeCloseTo(hitBox!.height, 1)
  expect(painted.radius).toBeCloseTo(radius === 'pill' ? Math.min(painted.width, painted.height) / 2 : radius, 1)
}

for (const width of [412, 1280] as const) {
  test.describe(`press shapes at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('fills navigation, composer, icon, and pill hit areas', async ({ page }) => {
      await page.goto('/')
      const destination = width === 412
        ? page.locator('[data-shell-tab-bar] nav > button').nth(2)
        : page.locator('[data-shell-sidebar] nav button').nth(2)
      await expectHoverOnHitArea(destination, width === 412 ? 'pill' : 12)

      const composer = page.locator('[data-shell-pinned-slot]')
      await expectHoverOnHitArea(composer.getByRole('button', { name: ptBr.todayAstra.openConversation }), 'pill')
      await expectHoverOnHitArea(composer.getByRole('group', { name: ptBr.shell.composer.suggestionsLabel }).getByRole('button').first(), 'pill')
      for (const label of [ptBr.chat.attachFile, ptBr.chat.attachImage, ptBr.shell.composer.voice.start]) {
        await expectHoverOnHitArea(composer.getByRole('button', { name: label }), 'pill')
      }
      await composer.locator('[data-composer-input]').fill('Como começo?')
      await expectHoverOnHitArea(composer.getByRole('button', { name: ptBr.shell.composer.send }), 'pill')

      await page.goto('/about')
      await expectHoverOnHitArea(page.locator('header button[aria-label]').first(), 'pill')
      await page.goto('/profile')
      await expectHoverOnHitArea(page.locator('.orbit-list-row-body').first(), 12)
      await page.goto('/upgrade')
      await expectHoverOnHitArea(page.locator('.orbit-pill-action:enabled').first(), 'pill')
      await page.goto('/wrapped')
      const restingChip = page.locator('.chip:not(.chip-active)').first()
      const activeChip = page.locator('.chip.chip-active').first()
      await expectHoverOnHitArea(restingChip, 'pill')
      await expectHoverOnHitArea(activeChip, 'pill')
      for (const chip of [restingChip, activeChip]) {
        const chipBox = await chip.boundingBox()
        expect(chipBox!.height, 'a chip paints its whole 44px hit area').toBeGreaterThanOrEqual(44)
        const chipPseudo = await chip.evaluate((element) => getComputedStyle(element, '::after').content)
        expect(chipPseudo, 'a chip carries no hit area the fill cannot reach').toBe('none')
      }
    })

    test('fills habit, menu, day, and segmented control hit areas', async ({ page, context }) => {
      await context.route(new RegExp(`${API.habits.list}[?]`), (route) => route.fulfill({ json: habitsPage }))
      await context.route(new RegExp(`${API.habits.calendarMonth}[?]`), (route) => route.fulfill({ json: calendarMonth }))
      await page.goto('/?date=2026-09-04')
      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      const listMenu = page.getByRole('menu', { name: ptBr.habits.listOptions })
      await expectHoverOnHitArea(listMenu.getByRole('menuitem', { name: ptBr.habits.refresh }), 12)
      await listMenu.getByRole('menuitem', { name: ptBr.habits.refresh }).click()

      const row = page.locator('[data-habit-title="Beber água"]')
      await expect(row).toBeVisible()
      await expectHoverOnHitArea(row.locator('[data-habit-row-body]'), 20)
      await expectHoverOnHitArea(row.locator('[data-habit-row-control="menu"]'), 'pill')
      await row.locator('[data-habit-row-control="menu"]').click()
      const menu = page.getByRole('menu', { name: habit.title })
      await expectHoverOnHitArea(menu.getByRole('menuitem', { name: ptBr.habits.actions.delete }), 12)
      await menu.getByRole('menuitem', { name: ptBr.habits.actions.delete }).click()
      await expectHoverOnHitArea(page.getByRole('dialog').locator('.orbit-pill-action:enabled').first(), 'pill')

      await page.goto('/calendar')
      await expectHoverOnHitArea(page.getByRole('radiogroup').getByRole('radio', { checked: false }).first(), 8)
      await page.getByRole('button', { name: ptBr.common.selectYear }).click()
      await expectHoverOnHitArea(page.getByRole('dialog').getByRole('button', { pressed: false }).first(), 'pill')
      await page.getByRole('dialog').getByRole('button', { pressed: true }).click()
      await expectHoverOnHitArea(page.locator('[role="radio"]:not([data-selected])').first(), 8)
      await expectHoverOnHitArea(page.locator('button[data-testid^="calendar-day-select-"]').first(), 'pill')
    })
  })
}

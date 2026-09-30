import { expect, type Locator } from '@playwright/test'
import { createElement } from 'react'
import { jsx } from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { calendarAutoSyncStateSchema, calendarSyncSuggestionSchema } from '@orbit/shared/types/calendar'
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

function renderCompactTargetInventory() {
  const router: AppRouterInstance = {
    back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {},
    bfcacheId: 'press-target',
  }
  const controls = [
    createElement(StreakBadge, { key: 'streak', streak: 3 }),
    createElement(HabitChecklist, {
      key: 'checklist', items: [{ text: 'Beber água', isChecked: true }],
      interactive: true, onReset() {}, onClear() {},
    }),
  ]
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
    jsx(NextIntlClientProvider, {
      locale: 'pt-BR', messages: ptBr, timeZone: 'UTC', children: controls,
    })))
}

async function readHitBoxOnceStill(control: Locator) {
  await expect(async () => {
    await control.scrollIntoViewIfNeeded()
    const first = await control.boundingBox()
    await control.page().waitForTimeout(250)
    expect(await control.boundingBox()).toEqual(first)
  }).toPass()
  return control.boundingBox()
}

async function readTargetGeometry(control: Locator) {
  return control.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const hit = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
    const pixels = (value: string) => Number.parseFloat(value) || 0
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo)
      if (style.content === 'none' || style.content === 'normal' || style.pointerEvents === 'none' || style.position !== 'absolute') continue
      const elementStyle = getComputedStyle(element)
      const width = pixels(style.width) + (style.boxSizing === 'border-box' ? 0 : pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth))
      const height = pixels(style.height) + (style.boxSizing === 'border-box' ? 0 : pixels(style.paddingTop) + pixels(style.paddingBottom) + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth))
      const left = bounds.left + pixels(elementStyle.borderLeftWidth) + (style.left === 'auto' ? bounds.width - pixels(style.right) - width : pixels(style.left))
      const top = bounds.top + pixels(elementStyle.borderTopWidth) + (style.top === 'auto' ? bounds.height - pixels(style.bottom) - height : pixels(style.top))
      hit.left = Math.min(hit.left, left)
      hit.top = Math.min(hit.top, top)
      hit.right = Math.max(hit.right, left + width)
      hit.bottom = Math.max(hit.bottom, top + height)
    }
    const fill = element.querySelector('[data-press-fill]') ?? element
    const fillBox = fill.getBoundingClientRect()
    const fillStyle = getComputedStyle(fill)
    return {
      hit,
      painted: { left: fillBox.left, top: fillBox.top, right: fillBox.right, bottom: fillBox.bottom },
      width: fillBox.width,
      height: fillBox.height,
      background: fillStyle.backgroundColor,
      opacity: fillStyle.opacity,
      radius: Math.min(pixels(fillStyle.borderTopLeftRadius), fillBox.width / 2, fillBox.height / 2),
    }
  })
}

async function expectHoverOnHitArea(control: Locator, radius: 'pill' | 8 | 12 | 20) {
  await expect(control).toBeVisible()
  await readHitBoxOnceStill(control)
  await control.page().mouse.move(0, 0)
  const resting = await readTargetGeometry(control)
  await control.hover()
  await expect.poll(async () => {
    const hovered = await readTargetGeometry(control)
    return hovered.background !== resting.background || hovered.opacity !== resting.opacity
  }, { message: 'the painted hit area responds to hover' }).toBe(true)
  const geometry = await readTargetGeometry(control)
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    expect(geometry.painted[edge], `the fill reaches the ${edge} hit edge including pseudo-elements`).toBeCloseTo(geometry.hit[edge], 1)
  }
  expect(geometry.radius).toBeCloseTo(radius === 'pill' ? Math.min(geometry.width, geometry.height) / 2 : radius, 1)
}

async function expectFullTouchTarget(control: Locator, radius: 'pill' | 8 | 12) {
  await expectHoverOnHitArea(control, radius)
  const geometry = await readTargetGeometry(control)
  expect(geometry.width).toBeGreaterThanOrEqual(44)
  expect(geometry.height).toBeGreaterThanOrEqual(44)
}

for (const width of [412, 1280] as const) {
  test.describe(`press shapes at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('fills navigation, composer, icon, and pill hit areas', async ({ page }) => {
      await page.goto('/?date=2026-09-04')
      for (const label of [ptBr.dates.previousDay, ptBr.dates.nextDay, ptBr.habits.listOptions]) {
        await expectFullTouchTarget(page.getByRole('button', { name: label, exact: true }), 'pill')
      }
      if (width === 412) await expectFullTouchTarget(page.getByRole('button', { name: ptBr.habits.search.title, exact: true }), 'pill')
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
      await page.evaluate((markup) => {
        const fixture = document.createElement('section')
        fixture.setAttribute('data-testid', 'compact-target-fixture')
        fixture.innerHTML = markup
        document.querySelector('main')!.append(fixture)
      }, renderCompactTargetInventory())
      await expectFullTouchTarget(page.getByTestId('compact-target-fixture').getByRole('button', { name: /Sequência/ }), 'pill')
      for (const label of [ptBr.habits.form.resetChecklist, ptBr.habits.form.clearChecklist]) {
        await expectFullTouchTarget(page.getByTestId('compact-target-fixture').getByRole('button', { name: label, exact: true }), 'pill')
      }
      await expectHoverOnHitArea(page.locator('header button[aria-label]').first(), 'pill')
      await page.goto('/profile')
      await expectFullTouchTarget(page.locator('a[href="/upgrade"]').filter({ hasText: ptBr.profile.allowance.seePro }).first(), 'pill')
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
      for (const label of [ptBr.calendar.goToCurrentMonth, ptBr.common.selectYear, ptBr.common.previousMonth, ptBr.common.nextMonth]) {
        await expectFullTouchTarget(page.getByRole('button', { name: label, exact: true }), 'pill')
      }
      await expectHoverOnHitArea(page.getByRole('radiogroup').getByRole('radio', { checked: false }).first(), 8)
      await page.getByRole('button', { name: ptBr.common.selectYear }).click()
      await expectHoverOnHitArea(page.getByRole('dialog').getByRole('button', { pressed: false }).first(), 'pill')
      await page.getByRole('dialog').getByRole('button', { pressed: true }).click()
      await expectHoverOnHitArea(page.locator('[role="radio"]:not([data-selected])').first(), 8)
      await expectHoverOnHitArea(page.locator('button[data-testid^="calendar-day-select-"]').first(), 'pill')
    })

    test('fills checklist, reminder, and date-picker targets', async ({ page }) => {
      await page.goto('/')
      const create = width === 1280
        ? page.locator('[data-shell-sidebar]').getByRole('button', { name: ptBr.nav.createHabit })
        : page.getByRole('button', { name: ptBr.habits.createManually })
      await create.click()
      await page.getByRole('button', { name: ptBr.habits.form.moreDetails }).click()
      const disclosure = page.locator('.habit-form-disclosure[data-open="true"]')
      await disclosure.getByPlaceholder(ptBr.habits.form.checklistPlaceholder).fill('Beber água')
      await disclosure.getByPlaceholder(ptBr.habits.form.checklistPlaceholder).press('Enter')
      const step = disclosure.locator('.checklist-drag-handle').locator('xpath=..')
      await step.hover()
      await expectFullTouchTarget(step.locator('.checklist-drag-handle'), 'pill')
      for (const label of [ptBr.habits.form.duplicateChecklistItem, ptBr.habits.form.removeChecklistItem]) {
        await step.hover()
        await expectFullTouchTarget(step.getByRole('button', { name: label }), 'pill')
      }
      await expectFullTouchTarget(disclosure.getByRole('button', { name: ptBr.habits.form.clearChecklist, exact: true }), 'pill')
      const time = disclosure.getByRole('textbox', { name: ptBr.habits.form.exactTime })
      await time.fill('08:00')
      await time.press('Tab')
      const reminders = disclosure.getByRole('switch', { name: ptBr.habits.form.reminder, exact: true })
      if (await reminders.getAttribute('aria-checked') !== 'true') await reminders.click()
      await disclosure.getByRole('button', { name: ptBr.habits.form.reminderAdd }).click()
      await disclosure.getByRole('button', { name: ptBr.habits.form.reminderCustom, exact: true }).click()
      await disclosure.getByPlaceholder(ptBr.habits.form.reminderCustomPlaceholder).fill('45')
      await expectFullTouchTarget(disclosure.getByRole('button', { name: ptBr.common.add, exact: true }).last(), 'pill')
      await disclosure.getByRole('button', { name: ptBr.common.selectDate, exact: true }).click()
      await expectFullTouchTarget(page.getByRole('dialog').last().getByRole('button', { name: ptBr.common.selectYear }), 8)
    })

    test('fills calendar week navigation and all-day overflow targets', async ({ page, context }) => {
      await context.route(new RegExp(`${API.habits.calendarMonth}[?]`), (route) => {
        const query = new URL(route.request().url()).searchParams
        const dateFrom = query.get('dateFrom')!
        const dateTo = query.get('dateTo')!
        const scheduledDates: string[] = []
        for (let instant = Date.parse(dateFrom); instant <= Date.parse(dateTo); instant += 86_400_000) {
          scheduledDates.push(new Date(instant).toISOString().slice(0, 10))
        }
        const habits = Array.from({ length: 8 }, (_, index) => makeHabitScheduleItem({
          id: `overflow-${index}`, title: `Beber água ${index + 1}`, dueDate: dateFrom,
          scheduledDates, dueTime: null, children: [], hasSubHabits: false,
        }))
        return route.fulfill({ json: calendarMonthResponseSchema.parse({ habits, logs: {} }) })
      })
      await page.goto('/calendar')
      await page.getByRole('radio', { name: ptBr.calendar.view.week, exact: true }).click()
      for (const label of [ptBr.common.previousWeek, ptBr.common.nextWeek, ptBr.calendar.goToCurrentWeek]) {
        await expectFullTouchTarget(page.getByRole('button', { name: label, exact: true }), 'pill')
      }
      await expectFullTouchTarget(page.getByTestId('time-grid-all-day-more').first(), 8)
    })

    test.describe('calendar review targets', () => {
      test.use({ subscriptionState: 'trial' })
      test('fills select-all and dismiss targets', async ({ page, context }) => {
        const suggestion = calendarSyncSuggestionSchema.parse({
          id: 'suggestion-1', googleEventId: 'event-1', discoveredAtUtc: '2026-09-04T12:00:00Z',
          event: { id: 'event-1', title: 'Beber água', description: null, startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] },
        })
        await context.route(new RegExp(`${API.calendar.autoSyncState}$`), (route) => route.fulfill({
          json: calendarAutoSyncStateSchema.parse({ enabled: true, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true }),
        }))
        await context.route(new RegExp(`${API.calendar.autoSyncSuggestions}$`), (route) => route.fulfill({ json: [suggestion] }))
        await page.goto('/calendar?mode=review')
        const sheet = page.getByRole('dialog')
        await expectFullTouchTarget(sheet.getByRole('button', { name: new RegExp(`^(${ptBr.calendar.selectAll}|${ptBr.calendar.deselectAll})$`) }), 'pill')
        await expectFullTouchTarget(sheet.getByRole('button', { name: ptBr.calendar.autoSync.dismissSuggestion }), 'pill')
      })
    })

  })
}

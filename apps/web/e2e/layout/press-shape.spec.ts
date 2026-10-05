import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { calendarAutoSyncStateSchema, calendarSyncSuggestionSchema } from '@orbit/shared/types/calendar'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema, createPaginatedSchema, habitDetailSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { test } from './upgrade-fixtures'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl } from '@orbit/shared/utils'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectFullTouchTarget, expectHoverOnHitArea } from './press-shape-helpers'

const habit = habitScheduleItemSchema.parse(makeHabitScheduleItem({
  title: 'Beber água',
  dueDate: '2026-09-04',
  scheduledDates: ['2026-09-04'],
  children: makeHabitScheduleItem().children.map((child) => ({ ...child, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] })),
  hasSubHabits: true,
}))
const habitsPage = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [habit], page: 1, pageSize: 200, totalCount: 1, totalPages: 1,
})
const calendarMonth = calendarMonthResponseSchema.parse({ habits: [habit], logs: {} })

function renderCompactTargetInventory() {
  return execFileSync(process.execPath, ['--import', 'tsx', resolve(__dirname, 'compact-target-inventory.tsx')], {
    encoding: 'utf8',
    env: { ...process.env, TSX_TSCONFIG_PATH: resolve(__dirname, 'compact-target-tsconfig.json') },
  })
}

for (const width of [412, 1280] as const) {
  test.describe(`press shapes at ${width}px`, () => {
    test.use({ appLocale: 'pt-BR', viewport: { width, height: 915 } })

    test('fills navigation, composer, icon, and pill hit areas', async ({ page, context }) => {
      await page.goto('/?date=2026-09-04')
      for (const label of [ptBr.dates.previousDay, ptBr.dates.nextDay, ptBr.habits.listOptions]) {
        await expectFullTouchTarget(page.getByRole('button', { name: label, exact: true }), 'pill')
      }
      if (width === 412) await expectFullTouchTarget(page.getByRole('button', { name: ptBr.habits.search.title, exact: true }), 'pill')
      const destination = width === 412
        ? page.locator('[data-shell-tab-bar] nav > button').nth(2).locator('[data-tab-indicator]')
        : page.locator('[data-shell-sidebar] nav button').nth(2)
      await expectHoverOnHitArea(destination, width === 412 ? 'pill' : 12)

      const composer = page.locator('[data-shell-pinned-slot]')
      await expectHoverOnHitArea(composer.getByRole('button', { name: ptBr.todayAstra.openConversation }), 'pill')
      await expectHoverOnHitArea(composer.getByRole('button', { name: ptBr.shell.composer.actions }), 'pill')
      await composer.locator('[data-composer-input]').focus()
      const conversation = page.locator(`[data-shell-conversation="${width === 1280 ? 'panel' : 'overlay'}"]`)
      await expect(conversation).toBeVisible()
      await expect(composer).toBeHidden()
      await expect(page.locator('[data-composer-input]:visible')).toHaveCount(1)
      await expectHoverOnHitArea(conversation.getByRole('group', { name: ptBr.shell.composer.suggestionsLabel }).getByRole('button').first(), 'pill')
      const conversationField = conversation.locator('[data-composer-input]')
      await expect(conversationField).toBeFocused()
      await conversationField.fill('Como começo?')
      await expectHoverOnHitArea(conversation.getByRole('button', { name: ptBr.shell.composer.send }), 'pill')
      await conversation.getByRole('button', { name: ptBr.shell.composer.actions }).click()
      const menu = page.getByRole('menu', { name: ptBr.shell.composer.actions, exact: true })
      for (const label of [ptBr.shell.composer.attach.file, ptBr.shell.composer.attach.image, ptBr.shell.composer.voice.start]) {
        await expectHoverOnHitArea(menu.getByRole('menuitem', { name: label, exact: true }), 12)
      }
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()

      await page.goto('/about')
      await expect(page.locator('main')).toBeVisible()
      await page.evaluate((markup) => {
        const fixture = document.createElement('section')
        fixture.setAttribute('data-testid', 'compact-target-fixture')
        fixture.innerHTML = markup
        document.querySelector('main')!.append(fixture)
      }, renderCompactTargetInventory())
      await expectFullTouchTarget(page.getByTestId('compact-target-fixture').getByRole('button', { name: /Sequência/ }), 'pill', '--bg-hover-opaque', '::after')
      for (const label of [ptBr.habits.form.resetChecklist, ptBr.habits.form.clearChecklist]) {
        await expectFullTouchTarget(page.getByTestId('compact-target-fixture').getByRole('button', { name: label, exact: true }), 'pill')
      }
      await expectFullTouchTarget(page.getByTestId('compact-target-fixture').getByRole('button', { name: ptBr.common.retry, exact: true }), 'pill', '--bg-hover')
      await expectHoverOnHitArea(page.locator('header button[aria-label]').first(), 'pill')
      await page.goto('/profile/astra')
      await expectFullTouchTarget(page.locator('a[href^="/upgrade"]').filter({ hasText: ptBr.profile.allowance.seePro }).first(), 'pill')
      await expectHoverOnHitArea(page.locator('.orbit-list-row-body').first(), 12)
      await page.goto('/upgrade')
      await expectHoverOnHitArea(page.locator('.orbit-pill-action:enabled').first(), 'pill')
      await context.route(`${LAYOUT_ORIGIN}${buildRecapRequestUrl('week')}`,
        (route) => route.fulfill({ json: recapResponseSchema.parse(createMockRecap()) }))
      await page.goto('/wrapped')
      const restingChip = page.locator('.chip:not(.chip-active)').first()
      const activeChip = page.locator('.chip.chip-active').first()
      await expectHoverOnHitArea(restingChip, 'pill', '--bg-hover')
      await expectHoverOnHitArea(activeChip, 'pill', '--bg-hover')
      for (const chip of [restingChip, activeChip]) {
        const chipBox = await chip.boundingBox()
        expect(chipBox!.height, 'a chip paints its whole 48px hit area').toBeGreaterThanOrEqual(48)
        const chipPseudo = await chip.evaluate((element) => getComputedStyle(element, '::after').content)
        expect(chipPseudo, 'a chip carries no hit area the fill cannot reach').toBe('none')
      }
      await page.getByRole('button', { name: ptBr.wrapped.start, exact: true }).click()
      await expectFullTouchTarget(page.getByRole('button', { name: ptBr.wrapped.close, exact: true }), 'pill', '--bg-hover')
    })

    test('fills habit, menu, day, and segmented control hit areas', async ({ page, context }) => {
      await context.route(new RegExp(`${API.habits.get(habit.id)}$`), (route) => route.fulfill({ json: habitDetailSchema.parse({ ...makeHabitDetail(), ...habit }) }))
      await context.route(new RegExp(`${API.habits.list}[?]`), (route) => route.fulfill({ json: habitsPage }))
      await context.route(new RegExp(`${API.habits.calendarMonth}[?]`), (route) => route.fulfill({ json: calendarMonth }))
      await page.goto('/?date=2026-09-04')
      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      const listMenu = page.getByRole('menu', { name: ptBr.habits.listOptions })
      await expectHoverOnHitArea(listMenu.getByRole('menuitem', { name: ptBr.habits.refresh }), 12)
      await listMenu.getByRole('menuitem', { name: ptBr.habits.refresh }).click()
      await page.getByRole('button', { name: ptBr.habits.listOptions }).click()
      await listMenu.getByRole('menuitem', { name: ptBr.common.select, exact: true }).click()
      const selectionTray = page.getByTestId('bulk-action-bar')
      await expectFullTouchTarget(selectionTray.getByRole('button', { name: ptBr.common.selectAll, exact: true }), 'pill', '--bg-hover-opaque')
      await selectionTray.getByRole('button', { name: ptBr.common.selectAll, exact: true }).click()
      await expectFullTouchTarget(selectionTray.getByRole('button', { name: ptBr.common.deselectAll, exact: true }), 'pill', '--bg-hover-opaque')
      await selectionTray.getByRole('button', { name: ptBr.common.cancel, exact: true }).click()

      const row = page.locator('[data-habit-title="Beber água"]')
      await expect(row).toBeVisible()
      await expectHoverOnHitArea(row.locator('[data-habit-row-body]'), 20)
      await expectHoverOnHitArea(row.locator('[data-habit-row-control="menu"]'), 'pill')
      await row.locator('[data-habit-row-control="menu"]').click()
      const menu = page.getByRole('menu', { name: habit.title })
      await menu.getByRole('menuitem', { name: ptBr.habits.actions.openSubHabits }).click()
      const drillBack = page.getByRole('button', { name: ptBr.common.back, exact: true })
      await expectHoverOnHitArea(drillBack, 'pill', '--bg-hover')
      await drillBack.click()
      await row.locator('[data-habit-row-control="menu"]').click()
      await expectHoverOnHitArea(menu.getByRole('menuitem', { name: ptBr.habits.actions.delete }), 12)
      await menu.getByRole('menuitem', { name: ptBr.habits.actions.delete }).click()
      await expectHoverOnHitArea(page.getByRole('dialog').locator('.orbit-pill-action:enabled').first(), 'pill')
      await expectHoverOnHitArea(page.getByRole('dialog').getByRole('button', { name: ptBr.common.close }), 'pill', '--bg-hover')

      await page.goto('/calendar')
      for (const label of [ptBr.common.previousMonth, ptBr.common.nextMonth]) {
        await expectFullTouchTarget(page.getByRole('button', { name: label, exact: true }), 'pill', '--bg-hover')
      }
      const monthTitle = page.getByRole('button', { name: new RegExp(`, ${ptBr.calendar.monthPicker}$`) })
      await expectFullTouchTarget(monthTitle, 'pill', '--bg-hover')
      await expectHoverOnHitArea(page.getByRole('radiogroup').getByRole('radio', { checked: false }).first(), 8)
      await monthTitle.click()
      const monthPicker = page.getByRole('dialog', { name: ptBr.calendar.monthPicker, exact: true })
      await expectFullTouchTarget(monthPicker.getByRole('button', { name: ptBr.calendar.thisMonth, exact: true }), 'pill', '--bg-hover')
      const yearTitle = monthPicker.getByRole('button', { name: new RegExp(`, ${ptBr.common.selectYear}$`) })
      await expectFullTouchTarget(yearTitle, 'pill', '--bg-hover')
      await yearTitle.click()
      await expectHoverOnHitArea(monthPicker.getByRole('button', { pressed: false }).first(), 'pill')
      await monthPicker.getByRole('button', { pressed: true }).click()
      await monthPicker.getByRole('button', { name: ptBr.calendar.thisMonth, exact: true }).click()
      await expectHoverOnHitArea(page.locator('[role="radio"]:not([data-selected])').first(), 8)
      await expectHoverOnHitArea(page.locator('button[data-testid^="calendar-day-select-"]').first(), 'pill')
    })

    test('fills checklist, reminder, and date-picker targets', async ({ page }) => {
      await page.goto('/habits/new')
      const screen = page.locator('[data-habit-create-screen]')
      await expect(screen).toBeVisible()
      const recurringTitleThatShowsEndDate = 'Beber água todo dia'
      await screen.getByRole('textbox', { name: ptBr.habits.form.describe, exact: true }).fill(recurringTitleThatShowsEndDate)
      await screen.getByRole('button', { name: ptBr.habits.form.moreDetails }).click()
      const disclosure = screen.locator('.habit-form-disclosure[data-open="true"]')
      await disclosure.getByPlaceholder(ptBr.habits.form.checklistPlaceholder).fill('Beber água')
      await disclosure.getByPlaceholder(ptBr.habits.form.checklistPlaceholder).press('Enter')
      const step = disclosure.locator('.checklist-drag-handle').locator('xpath=..')
      await step.hover()
      await expectFullTouchTarget(step.locator('.checklist-drag-handle'), 'pill')
      for (const label of [ptBr.habits.form.duplicateChecklistItem, ptBr.habits.form.removeChecklistItem]) {
        await step.hover()
        await expectFullTouchTarget(step.getByRole('button', { name: label }), 'pill')
      }
      await expectFullTouchTarget(disclosure.getByRole('button', { name: ptBr.habits.form.clearChecklist, exact: true }), 8)
      const time = disclosure.getByRole('textbox', { name: ptBr.habits.form.exactTime })
      await time.fill('08:00')
      await time.press('Tab')
      const reminders = disclosure.getByRole('switch', { name: ptBr.habits.form.reminder, exact: true })
      if (await reminders.getAttribute('aria-checked') !== 'true') await reminders.click()
      await disclosure.getByRole('button', { name: ptBr.habits.form.reminderAdd }).click()
      await disclosure.getByRole('button', { name: ptBr.habits.form.reminderCustom, exact: true }).click()
      await disclosure.getByRole('spinbutton', { name: ptBr.habits.form.reminderCustomLabel }).fill('45')
      const customReminder = disclosure.getByRole('spinbutton', { name: ptBr.habits.form.reminderCustomLabel }).locator('..').locator('..')
      await expectFullTouchTarget(customReminder.getByRole('button', { name: ptBr.common.add, exact: true }), 'pill')
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
      for (const label of [ptBr.common.previousWeek, ptBr.common.nextWeek]) {
        await expectFullTouchTarget(page.getByRole('button', { name: label, exact: true }), 'pill')
      }
      await expectFullTouchTarget(page.getByRole('button', { name: new RegExp(`, ${ptBr.calendar.goToCurrentWeek}$`) }), 'pill')
      await expectFullTouchTarget(page.getByTestId('time-grid-all-day-summary').first(), 8)
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
        await context.route(new RegExp(`${API.habits.calendarMonth}[?]`), (route) => route.fulfill({ json: calendarMonth }))
        await context.route(new RegExp(`${API.calendar.events}[?]`), (route) => route.fulfill({ json: [] }))
        await page.goto('/calendar?mode=review')
        const sheet = page.getByRole('dialog', { name: ptBr.calendar.autoSync.reviewModeTitle, exact: true })
        await expect(sheet).toBeVisible()
        await expect(sheet.getByText(suggestion.event.title, { exact: true })).toBeVisible()
        await expectFullTouchTarget(sheet.getByRole('button', { name: new RegExp(`^(${ptBr.calendar.selectAll}|${ptBr.calendar.deselectAll})$`) }), 'pill')
        await expectFullTouchTarget(sheet.getByRole('button', { name: ptBr.calendar.autoSync.dismissSuggestion }), 'pill')
      })
    })

  })
}

import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createHabitViewItems, createHabitViewScheduleItems } from '@orbit/shared/__tests__/habit-view-fixtures'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { setLayoutFixtureSession } from './profile-session'
import { openTodayListOptions } from './hydration-guard'
import { test } from './upgrade-fixtures'

const today = '2026-09-04'
const selectedDay = '2026-09-03'
const habitPage = (items: HabitScheduleItem[]) => ({ ...emptyHabitsPageFixture, items, totalCount: items.length })

for (const [locale, words] of [['en', en], ['pt-BR', ptBr]] as const) {
  test.describe(`desktop scoped habit search in ${locale}`, () => {
    test.use({ appLocale: locale, viewport: { width: 1280, height: 915 } })

    for (const [view, label, query, excluded] of [
      ['today', words.habits.viewToday, 'Today child', 'Overdue'],
      ['all', words.habits.viewAll, 'Later child', 'Future'],
      ['general', words.habits.viewGeneral, 'Any day child', 'Any day done'],
    ] as const) {
      test(`filters and selects within ${view} while retaining its scope`, async ({ page, context }) => {
        const date = view === 'today' ? selectedDay : today
        const items = createHabitViewItems(date, view)
          .filter((habit) => view === 'general' || habit.frequencyUnit === 'Day')
          .map((habit) => habit.id === 'general-done' ? { ...habit, isCompleted: false } : habit)
        const searched = items.filter((habit) => habit.children.some((child) => child.title === query))
          .map((habit) => ({ ...habit, searchMatches: [{ field: 'child' as const, value: query }],
            children: habit.children.map((child) => ({ ...child,
              searchMatches: child.title === query ? [{ field: 'title' as const, value: query }] : [],
            })),
          }))
        await setLayoutFixtureSession(context, [
          { path: API.habits.list, body: habitPage(items) },
          { path: API.habits.list, query: { dateFrom: today, dateTo: today, includeOverdue: 'true', pageSize: '200' }, body: habitPage(createHabitViewScheduleItems(today)) },
          { path: API.habits.list, query: { search: query }, body: habitPage(searched) },
          { path: API.habits.count, body: { count: items.length } },
        ])
        await page.goto(view === 'today' ? `/?date=${selectedDay}` : '/')
        await openTodayListOptions(page, words.habits.listOptions)
        await page.getByRole('menuitem', { name: words.habits.frequencyFilter }).click()
        await page.getByRole('menuitemcheckbox', { name: words.habits.filter.daily, exact: true }).click()
        const control = page.getByRole('radiogroup', { name: words.habits.viewsLabel })
        const first = control.getByRole('radio', { name: words.habits.viewToday, exact: true })
        await first.focus()
        for (let step = 0; step < ['today', 'all', 'general'].indexOf(view); step += 1) await page.keyboard.press('ArrowRight')
        const selectedView = control.getByRole('radio', { name: label, exact: true })
        await expect(selectedView).toHaveAttribute('aria-checked', 'true')
        const rows = page.getByTestId('habit-row')
        await expect(rows.filter({ hasText: excluded })).toBeVisible()
        const pager = page.locator('[data-today-date-row]')
        const dateText = view === 'today' ? await pager.innerText() : null
        const search = page.locator('[data-shell-header] [data-today-header-actions]')
          .getByRole('button', { name: words.habits.search.title, exact: true })
        await search.click()
        const field = page.getByRole('textbox', { name: words.habits.search.title, exact: true })
        await expect(field).toBeFocused()
        const request = page.waitForRequest((entry) => {
          const url = new URL(entry.url())
          return url.pathname === API.habits.list && url.searchParams.get('search') === query
        })
        await field.fill(query)
        const scope = new URL((await request).url()).searchParams
        expect(scope.get('frequencyUnit')).toBe(view === 'general' ? null : 'Day')
        expect(scope.get('isGeneral')).toBe(view === 'general' ? 'true' : null)
        expect(scope.get('dateFrom')).toBe(view === 'today' ? selectedDay : null)
        expect(scope.get('dateTo')).toBe(view === 'today' ? selectedDay : null)
        expect(scope.get('includeOverdue')).toBeNull()
        await expect(rows.filter({ hasText: query })).toBeVisible()
        await expect(rows.filter({ hasText: excluded })).toHaveCount(0)
        await expect(rows).toHaveCount(2)
        await expect(selectedView).toHaveAttribute('aria-checked', 'true')
        if (view === 'today') {
          await expect(pager).toHaveText(dateText!, { useInnerText: true })
          await expect(page).toHaveURL(new RegExp(`\\?date=${selectedDay}$`))
        } else await expect(pager).toHaveCount(0)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.locator('[data-shell-sidebar]').getByRole('button', { name: words.nav.search, exact: true })).toBeVisible()
        await openTodayListOptions(page, words.habits.listOptions)
        await page.getByRole('menuitem', { name: words.habits.frequencyFilter }).click()
        await expect(page.getByRole('menuitemcheckbox', { name: words.habits.filter.daily, exact: true })).toBeChecked()
        await page.keyboard.press('Escape')
        await openTodayListOptions(page, words.habits.listOptions)
        await page.getByRole('menuitem', { name: words.common.select, exact: true }).click()
        const selection = rows.filter({ hasText: query }).locator('[data-habit-row-control="selection"]')
        await selection.click()
        await expect(selection).toHaveAttribute('aria-pressed', 'true')
        await expect(field).toHaveValue(query)
        await expect(selectedView).toHaveAttribute('aria-checked', 'true')
      })
    }
  })
}

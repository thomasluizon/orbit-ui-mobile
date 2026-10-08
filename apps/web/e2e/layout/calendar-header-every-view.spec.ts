import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { resolveWebThemeVariables } from '../../lib/theme-dom'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ title: 'Walking', children: [], hasSubHabits: false, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] })],
  logs: {},
})

async function box(element: Locator) {
  return element.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { top: bounds.top, bottom: bounds.bottom, height: bounds.height }
  })
}

for (const width of [320, 412, 600, 840]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const mode of ['light', 'dark'] as const) {
      test.describe(`${locale} calendar header at ${width}px in ${mode}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { weekStartDay: 1 } })
        test('keeps the selector aligned and each body 24px below it', async ({ page, context }) => {
          await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
            (route) => route.fulfill({ json: calendarMonth }))
          await page.goto('/calendar')
          await expect(page.getByTestId('calendar-grid-card')).toBeVisible()
          await page.evaluate(({ mode, variables }) => {
            document.documentElement.classList.remove('light', 'dark')
            document.documentElement.classList.add(mode)
            for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
          }, { mode, variables: resolveWebThemeVariables('orange', mode) })
          const header = page.getByTestId('calendar-header-group')
          const selector = header.getByRole('radiogroup')
          let initialTop: number | undefined
          for (const view of ['month', 'week', 'range', 'agenda'] as const) {
            await selector.getByRole('radio', { name: words.calendar.view[view], exact: true }).click()
            const body = view === 'month' ? page.getByTestId('calendar-grid-card')
              : view === 'week' ? page.getByTestId('calendar-time-grid')
                : view === 'range' ? page.getByRole('region').filter({ has: page.getByTestId('month-grid-days') }).locator('.orbit-calendar-grid-card')
                  : page.getByTestId('calendar-agenda-day').first()
            await expect(body).toBeVisible()
            const segments = await box(selector)
            initialTop ??= segments.top
            expect(segments.top, view).toBe(initialTop)
            expect((await box(body)).top - segments.bottom, `${view} body clearance`).toBe(24)
            const navigation = header.locator('[data-testid$="-navigation"]')
            expect((await box(navigation)).height).toBe(48)
            const controls = navigation.locator('button')
            for (const control of await controls.all()) {
              const paint = await control.evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, ring: getComputedStyle(button).boxShadow }))
              expect(paint.background).toBe('rgba(0, 0, 0, 0)')
              const isChevron = await control.evaluate((button) => !button.textContent.trim())
              if (isChevron || view === 'week' || view === 'agenda') {
                expect(paint.ring).toContain('1.5px')
                expect(paint.ring).toContain('inset')
              }
            }
          }
          const current = header.getByRole('button', { name: new RegExp(`, ${words.dates.today}$`) })
          const firstDay = page.getByTestId('calendar-agenda-day').first()
          const initialDay = await firstDay.textContent()
          await header.getByRole('button', { name: words.common.nextWeek, exact: true }).click()
          await expect.poll(() => firstDay.textContent()).not.toBe(initialDay)
          await current.click()
          await expect.poll(() => firstDay.textContent()).toBe(initialDay)
          expect((await box(firstDay)).top - (await box(selector)).bottom).toBe(24)
        })
      })
    }
  }
}

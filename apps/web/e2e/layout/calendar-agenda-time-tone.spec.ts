import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({
    title: 'Caminhar',
    children: [],
    hasSubHabits: false,
    dueDate: '2026-09-04',
    scheduledDates: ['2026-09-04'],
    dueTime: '08:00',
  })],
  logs: {},
})

async function timePaint(time: Locator, token: '--fg-2' | '--fg-3') {
  return time.evaluate((element, token) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${token})`
    element.append(probe)
    const expected = getComputedStyle(probe).color
    probe.remove()
    return { actual: getComputedStyle(element).color, expected }
  }, token)
}

for (const width of [412, 1280]) {
  for (const mode of ['dark', 'light'] as const) {
    test.describe(`pt-BR Agenda time at ${width}px in ${mode}`, () => {
      test.use({
        appLocale: 'pt-BR',
        viewport: { width, height: 915 },
        layoutProfile: { themePreference: mode, uses24HourClock: true },
      })

      test('uses metadata tone at rest and promotes it on desktop hover', async ({ page, context }) => {
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
        await page.goto('/calendar')
        await page.getByRole('radio', { name: ptBR.calendar.view.agenda, exact: true }).click()
        const agenda = page.getByTestId('calendar-agenda-view')
        const row = agenda.getByRole('button', { name: /^Caminhar, 08:00, / })
        const time = row.locator('[data-slot="list-row-value"]')
        await expect(time).toHaveText('08:00')
        await expect(time).toBeVisible()
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`))
        await page.mouse.move(0, 0)
        const resting = await timePaint(time, '--fg-3')
        expect(resting.actual).toBe(resting.expected)

        if (width === 1280) {
          await row.hover()
          await page.evaluate(() => new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          }))
          const hovered = await timePaint(time, '--fg-2')
          expect(hovered.actual).toBe(hovered.expected)
          expect(hovered.actual).not.toBe(resting.actual)
        }
      })
    })
  }
}

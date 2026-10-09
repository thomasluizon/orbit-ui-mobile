import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectFullTouchTarget } from './press-shape-helpers'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const dates = Array.from({ length: 7 }, (_, index) => `2026-10-${String(5 + index).padStart(2, '0')}`)
const untimedNames = ['Sweep-Supercalifragilisticexpialidocious-Token-Habit', 'Organizar as anotações e preparar a próxima semana com calma', 'Evitar doces']
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [
    ['Beber água', '08:00'], ['Ler 10 minutos', '21:00'],
    ...untimedNames.map((title) => [title, null]),
  ].map(([title, dueTime], index) => makeHabitScheduleItem({
    id: `week-pattern-${index}`, title: title!, dueTime,
    isBadHabit: index === 4, children: [], hasSubHabits: false,
    dueDate: dates[0]!, scheduledDates: index < 2 ? dates : dates.slice(1),
  })),
  logs: {},
})

for (const viewport of [{ width: 1352, height: 706 }, { width: 1100, height: 726 }, { width: 840, height: 726 }, { width: 412, height: 640 }]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} week pattern at ${viewport.width}x${viewport.height}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, timeZone: 'UTC', weekStartDay: 1 })
      test.use({ appLocale: locale, viewport, layoutProfile: profile })
      test.beforeEach(async ({ context, page }) => {
        await setLayoutProfileSession(context, profile)
        await page.clock.setFixedTime(new Date('2026-10-08T21:30:00Z'))
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('names entries, keeps day lanes reachable and opens at now', async ({ page }) => {
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.week, exact: true }).click()
        const grid = page.getByTestId('calendar-time-grid')
        await expect(grid.getByTestId('time-grid-event')).toHaveCount(14)
        const line = grid.getByRole('img', { name: words.calendar.timeGrid.now, exact: true })
        await expect.poll(async () => line.evaluate((element) => {
          const scroller = element.closest('[data-testid="time-grid-hour-scroller"]')!
          const pane = scroller.firstElementChild!
          const viewport = scroller.getBoundingClientRect()
          const line = element.getBoundingClientRect()
          const top = pane.getAttribute('data-pinning') === 'pinned'
            ? Math.max(pane.getBoundingClientRect().bottom, viewport.top) : viewport.top
          return line.top >= top && line.bottom <= viewport.bottom
            && line.top <= top + (viewport.bottom - top) / 3
            && line.left >= viewport.left && line.right <= viewport.right
        })).toBe(true)

        await grid.getByTestId('time-grid-hour-scroller').evaluate((element) => { element.scrollTop = 0 })

        for (const block of await grid.getByTestId('time-grid-event').all()) {
          const title = await block.getByTestId('time-grid-event-name').textContent()
          expect(title === 'Beber água' || title === 'Ler 10 minutos').toBe(true)
          const visibleText = (await block.innerText()).trim()
          expect(visibleText.startsWith(title!) || (visibleText.endsWith('…') && title!.startsWith(visibleText.slice(0, -1)))).toBe(true)
          await expect(block.locator('[data-status]')).toHaveCount(1)
        }
        expect(await grid.evaluate((element) => [...element.querySelectorAll<HTMLElement>('*')]
          .filter((node) => [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
          .every((node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 12))).toBe(true)

        const monday = grid.locator('[data-testid="time-grid-all-day"][data-date="2026-10-05"]')
        const tuesday = grid.locator('[data-testid="time-grid-all-day"][data-date="2026-10-06"]')
        await expect(monday.locator('button')).toHaveCount(0)
        await expect(tuesday.getByTestId('time-grid-all-day-event')).toHaveCount(1)
        await expect(tuesday.getByTestId('time-grid-all-day-event')).toHaveAccessibleName(untimedNames[0]!)
        await expect(tuesday.getByTestId('time-grid-all-day-more')).toHaveText('+2')
        expect(await grid.getByTestId('time-grid-all-day-band').evaluate((element) => [...element.querySelectorAll('button')]
          .every((button) => !/^\d+$/.test(button.textContent!.trim())))).toBe(true)
        expect(await grid.getByTestId('time-grid-any-time-label').evaluate((element) => {
          const label = element.getBoundingClientRect()
          const grid = element.closest('[data-testid="calendar-time-grid"]')!.getBoundingClientRect()
          return label.top >= grid.top && label.bottom <= grid.bottom && label.left >= grid.left && label.right <= grid.right
        })).toBe(true)

        expect(await grid.getByTestId('time-grid-col-header').evaluateAll((headers) => headers.every((header) => {
          const weekday = header.firstElementChild!
          const style = getComputedStyle(weekday)
          return style.textTransform === 'none' && ['normal', '0px'].includes(style.letterSpacing)
        }))).toBe(true)
        expect(await grid.getByTestId('time-grid-col-header').evaluateAll((headers) => {
          const monday = headers[0]!, today = headers[3]!
          const probe = document.createElement('span')
          probe.style.backgroundColor = 'var(--primary)'
          today.append(probe)
          const primary = getComputedStyle(probe).backgroundColor
          probe.remove()
          return getComputedStyle(today.firstElementChild!).color === getComputedStyle(monday.firstElementChild!).color
            && [...today.querySelectorAll('*')].filter((element) => getComputedStyle(element).backgroundColor === primary).length === 1
        })).toBe(true)

        for (const cell of await grid.getByTestId('time-grid-all-day').all()) {
          for (const chip of await cell.locator('button').all()) await expectFullTouchTarget(chip, 8)
          expect(await cell.evaluate((element) => {
            const targets = [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect())
            return targets.every((target, index) => targets.slice(index + 1).every((other) => target.right < other.left || other.right < target.left || target.bottom < other.top || other.bottom < target.top))
          })).toBe(true)
        }
        const firstChip = tuesday.getByTestId('time-grid-all-day-event')
        await firstChip.focus()
        await expect.poll(async () => firstChip.evaluate((element) => {
          const body = element.closest('[data-testid="time-grid-hour-scroller"]')!
          const gutter = body.querySelector('[data-testid="time-grid-any-time-label"]')!.parentElement!
          return element.getBoundingClientRect().left >= gutter.getBoundingClientRect().right
        })).toBe(true)
        await tuesday.getByTestId('time-grid-all-day-more').click()
        const daySheet = page.getByRole('dialog')
        await expect(daySheet).toBeVisible()
        for (const title of untimedNames) await expect(daySheet.getByText(title, { exact: true })).toBeVisible()
      })
    })
  }
}

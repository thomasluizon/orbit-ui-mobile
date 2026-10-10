import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { expectFullTouchTarget } from './press-shape-helpers'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const dates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(LAYOUT_FIXED_TIME)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + index)
  return date.toISOString().slice(0, 10)
})
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

for (const viewport of [{ width: 1352, height: 706 }, { width: 1100, height: 726 }, { width: 840, height: 726 }, { width: 600, height: 726 }, { width: 412, height: 640 }]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} week pattern at ${viewport.width}x${viewport.height}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, timeZone: 'UTC', weekStartDay: 1 })
      test.use({ appLocale: locale, viewport, layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('keeps 192 day columns, complete short names and a pinned gutter', async ({ page, context }) => {
        const shortName = locale === 'pt-BR' ? 'Revisar notas' : 'Review notes'
        const longName = 'Sweep-Supercalifragilisticexpialidocious-Token-Habit'
        const shortNameCalendar = calendarMonthResponseSchema.parse({
          habits: [[shortName, null], [shortName, '08:00'], [longName, null], ['Organizar as anotações e preparar a próxima semana com calma', '18:00']]
            .map(([title, dueTime], index) => makeHabitScheduleItem({
              id: `week-width-${index}`, title: title!, dueTime, children: [], hasSubHabits: false,
              dueDate: dates[0]!, scheduledDates: dates,
            })),
          logs: {},
        })
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: shortNameCalendar }))
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.week, exact: true }).click()
        const grid = page.getByTestId('calendar-time-grid')
        await expect(grid.getByTestId('time-grid-event')).toHaveCount(14)
        await page.evaluate(() => document.fonts.ready)
        for (const scale of [1, 2]) {
          await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
          await expect.poll(() => grid.getByTestId('time-grid-day-column').evaluateAll((columns, scale) =>
            columns.length === 7 && columns.every((column) => column.getBoundingClientRect().width >= 192 * scale), scale)).toBe(true)
          const geometry = await grid.evaluate((element, shortName) => {
            const scroller = element.querySelector<HTMLElement>('[data-testid="time-grid-hour-scroller"]')!
            scroller.scrollTop = 0
            scroller.scrollLeft = 0
            const gutter = element.querySelector('[data-testid="time-grid-any-time-label"]')!.parentElement!
            const start = gutter.getBoundingClientRect()
            const widths = (testId: string) => [...element.querySelectorAll(`[data-testid="${testId}"]`)].map((node) => node.getBoundingClientRect().width)
            const names = [...element.querySelectorAll<HTMLElement>('[data-personal-text], [data-testid="time-grid-all-day-event"] > span > span')].map((name) => {
              const bounds = name.getBoundingClientRect()
              const range = document.createRange(); range.selectNodeContents(name)
              return { title: name.textContent, complete: [...range.getClientRects()].every((rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1),
                clamp: getComputedStyle(name).webkitLineClamp, ellipsis: getComputedStyle(name).textOverflow, overflow: name.scrollWidth > name.clientWidth }
            })
            scroller.scrollLeft = scroller.scrollWidth
            const horizontalOwners = []
            for (let node: HTMLElement | null = scroller; node; node = node.parentElement) {
              if (['auto', 'scroll'].includes(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1) horizontalOwners.push(node.dataset.testid)
            }
            return { columns: widths('time-grid-day-column'), headers: widths('time-grid-col-header'), cells: widths('time-grid-all-day'),
              shortNames: names.filter(({ title }) => title === shortName), longNames: names.filter(({ title }) => title !== shortName),
              gutterWidth: start.width, gutterStart: start.left, gutterEnd: gutter.getBoundingClientRect().left, horizontalOwners,
              travel: scroller.scrollLeft, page: document.documentElement.clientWidth, pageScroll: document.documentElement.scrollWidth }
          }, shortName)
          expect(geometry.headers).toEqual(geometry.columns)
          expect(geometry.cells).toEqual(geometry.columns)
          expect(geometry.shortNames).toHaveLength(14)
          expect(geometry.shortNames.every(({ complete }) => complete)).toBe(true)
          expect(geometry.longNames.filter(({ clamp }) => clamp === '2')).toHaveLength(7)
          expect(geometry.longNames.filter(({ ellipsis, overflow }) => ellipsis === 'ellipsis' && overflow)).toHaveLength(7)
          expect(geometry.horizontalOwners).toEqual(['time-grid-hour-scroller'])
          expect(geometry.gutterEnd).toBe(geometry.gutterStart)
          if (scale === 1) expect(geometry.gutterWidth).toBe(96)
          expect(geometry.travel).toBeGreaterThan(0)
          expect(geometry.pageScroll).toBe(geometry.page)
        }
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

        const monday = grid.locator(`[data-testid="time-grid-all-day"][data-date="${dates[0]}"]`)
        const tuesday = grid.locator(`[data-testid="time-grid-all-day"][data-date="${dates[1]}"]`)
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
        expect(await grid.getByTestId('time-grid-col-header').evaluateAll((headers, todayIndex) => {
          const monday = headers[0]!, today = headers[todayIndex]!
          const probe = document.createElement('span')
          probe.style.backgroundColor = 'var(--primary)'
          today.append(probe)
          const primary = getComputedStyle(probe).backgroundColor
          probe.remove()
          return getComputedStyle(today.firstElementChild!).color === getComputedStyle(monday.firstElementChild!).color
            && [...today.querySelectorAll('*')].filter((element) => getComputedStyle(element).backgroundColor === primary).length === 1
        }, dates.indexOf(LAYOUT_FIXED_TIME.slice(0, 10)))).toBe(true)

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

import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const dates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(LAYOUT_FIXED_TIME)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + index)
  return date.toISOString().slice(0, 10)
})
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [
    ['Caminhar pelo bairro depois do trabalho', '09:00', '10:00'],
    ['Ler os capítulos para o encontro de leitura', '09:30', '10:30'],
    ['Organizar as anotações e preparar a próxima semana', '18:00', '19:00'],
    ['Conversar com os amigos', null, null],
  ].map(([title, dueTime, dueEndTime], index) => makeHabitScheduleItem({
    id: `week-scroll-habit-${index}`, title: title!, dueTime, dueEndTime,
    children: [], hasSubHabits: false, dueDate: dates[0]!,
    scheduledDates: dates,
  })),
  logs: {},
})
const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR', timeZone: 'UTC', weekStartDay: 1 })

async function scrollAncestors(hour: Locator) {
  return hour.evaluate((element) => {
    const ancestors = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowY
      if (overflow !== 'auto' && overflow !== 'scroll') continue
      const rect = parent.getBoundingClientRect()
      ancestors.push({ top: rect.top + parent.clientTop, bottom: rect.top + parent.clientTop + parent.clientHeight,
        ownsScroll: parent.scrollHeight > parent.clientHeight + 1, scrollTop: parent.scrollTop })
    }
    return ancestors
  })
}

async function scrollHours(hour: Locator, position: 'start' | 'end') {
  await hour.evaluate((element, position) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
        parent.scrollTop = position === 'start' ? 0 : parent.scrollHeight
        return
      }
    }
    throw new Error('Hour scroll owner missing')
  }, position)
}

async function waitForWeekGeometry(scroller: Locator) {
  await expect.poll(() => scroller.evaluate(async (element) => {
    const measure = () => [element.clientHeight, element.scrollHeight, element.firstElementChild!.clientHeight,
      element.firstElementChild!.getAttribute('data-pinning')]
    const before = measure()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const middle = measure()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const after = measure()
    return element.clientHeight > 0 && JSON.stringify(before) === JSON.stringify(middle)
      && JSON.stringify(middle) === JSON.stringify(after)
  })).toBe(true)
}

async function hasVisibleHour(scroller: Locator) {
  return scroller.evaluate((element) => {
    const viewport = element.getBoundingClientRect()
    const pane = element.firstElementChild!
    const top = pane.getAttribute('data-pinning') === 'pinned'
      ? Math.max(viewport.top, pane.getBoundingClientRect().bottom) : viewport.top
    return [...element.querySelectorAll('[data-testid="time-grid-hour-label"]')].some((hour) => {
      const rect = hour.getBoundingClientRect()
      return rect.top >= top && rect.bottom <= viewport.bottom
    })
  })
}

for (const viewport of [{ width: 1352, height: 726 }, { width: 1100, height: 726 }, { width: 412, height: 640 }]) {
  for (const themeMode of ['dark', 'light'] as const) {
    test.describe(`Week scroll at ${viewport.width}x${viewport.height} in ${themeMode}`, () => {
      const themedProfile = profileSchema.parse({ ...profile, themePreference: themeMode })
      test.use({ appLocale: 'pt-BR', viewport, layoutProfile: themedProfile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, themedProfile)
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('keeps one hour owner and the complete weekday header clear of options', async ({ page }) => {
        await page.goto('/calendar')
        await page.getByRole('radio', { name: ptBR.calendar.view.week, exact: true }).click()
        const hour = page.getByTestId('time-grid-hour-label').first()
        const scroller = page.getByTestId('time-grid-hour-scroller')
        const header = page.getByTestId('time-grid-col-header').first().locator('..')
        const options = page.getByRole('button', { name: ptBR.calendar.options, exact: true })
        await expect(hour).toBeAttached()
        await expect.poll(async () => (await scrollAncestors(hour)).filter((ancestor) => ancestor.ownsScroll).length).toBe(1)

        for (const textScale of viewport.width === 412 ? [1] : [1, 2]) {
          await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, textScale)
          await waitForWeekGeometry(scroller)
          for (const position of ['start', 'end'] as const) {
            await scrollHours(hour, position)
            await expect.poll(async () => {
              const headerBox = await header.boundingBox()
              const optionsBox = await options.boundingBox()
              if (!headerBox || !optionsBox) return false
              const ancestors = await scrollAncestors(hour)
              const pinned = await scroller.getByTestId('time-grid-day-pane').getAttribute('data-pinning') === 'pinned'
              const within = !pinned || ancestors.every((ancestor) => headerBox.y >= ancestor.top - 1
                && headerBox.y + headerBox.height <= ancestor.bottom + 1)
              const overlaps = headerBox.x < optionsBox.x + optionsBox.width && optionsBox.x < headerBox.x + headerBox.width
                && headerBox.y < optionsBox.y + optionsBox.height && optionsBox.y < headerBox.y + headerBox.height
              return ancestors.filter((ancestor) => ancestor.ownsScroll).length === 1 && within && !overlaps
            }).toBe(true)
          }
        }
      })

      if (viewport.width !== 412) {
        test('keeps one scroll owner and reachable hours at 200% text', async ({ page }) => {
          await page.goto('/calendar')
          await page.getByRole('radio', { name: ptBR.calendar.view.week, exact: true }).click()
          const scroller = page.getByTestId('time-grid-hour-scroller')
          const hour = page.getByTestId('time-grid-hour-label').first()
          await expect(hour).toBeAttached()
          await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
          await waitForWeekGeometry(scroller)
          await expect.poll(async () => (await scrollAncestors(hour)).filter((ancestor) => ancestor.ownsScroll).length).toBe(1)
          const pane = scroller.getByTestId('time-grid-day-pane')
          expect(await pane.evaluate((element) => element.getAttribute('data-pinning') === 'pinned'
            ? element.clientHeight <= element.parentElement!.clientHeight / 2
            : element.clientHeight > element.parentElement!.clientHeight / 2)).toBe(true)
          await scroller.evaluate((element) => {
            const pane = element.firstElementChild!
            const label = element.querySelectorAll<HTMLElement>('[data-testid="time-grid-hour-label"]')[12]!
            const paneHeight = pane.getAttribute('data-pinning') === 'pinned' ? pane.clientHeight : 0
            element.scrollTop += label.getBoundingClientRect().top - element.getBoundingClientRect().top - paneHeight
          })
          await expect.poll(() => hasVisibleHour(scroller)).toBe(true)
        })
      }
    })
  }
}

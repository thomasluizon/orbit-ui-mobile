import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, expectLegendFits, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const habitTitle = 'Caminhar pelo bairro depois do trabalho e conversar com os amigos'
const calendarMonth = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ title: habitTitle, children: [], hasSubHabits: false, dueDate: '2026-09-04', scheduledDates: ['2026-09-04'] })],
  logs: {},
})

async function bounds(control: Locator) {
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, center: (box.top + box.bottom) / 2, width: box.width, height: box.height }
  })
}

for (const width of [320, 360, 384, 412, 600, 840]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} calendar period headers at ${width}px`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, weekStartDay: 1 })
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
          (route) => route.fulfill({ json: calendarMonth }))
      })

      test('week pager precedes the last header line and retains its week while paging', async ({ page }) => {
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.week, exact: true }).click()
        const header = page.getByTestId('calendar-header-group')
        const selector = header.getByRole('radiogroup')
        const previous = page.getByRole('button', { name: words.common.previousWeek, exact: true })
        const next = page.getByRole('button', { name: words.common.nextWeek, exact: true })
        const current = page.getByRole('button', { name: new RegExp(`, ${words.calendar.goToCurrentWeek}$`) })
        const originalWeek = await current.innerText()
        for (const control of [previous, current, next]) {
          await expect(control).toBeVisible()
          expect(await control.evaluate((element) => Boolean(element.closest('[data-testid="calendar-header-group"]')))).toBe(true)
          const box = await bounds(control)
          const segments = await bounds(selector)
          expect(box.bottom).toBeLessThanOrEqual(segments.top)
          expect(box.bottom).toBeLessThan(segments.bottom)
          expect(box.width).toBeGreaterThanOrEqual(48)
          expect(box.height).toBeGreaterThanOrEqual(48)
          await expectInteractionFill(control)
        }
        await markRequiredLabels(current)
        await markUserText(page, [habitTitle])
        await expectLabelsFit(page, header)
        await next.click()
        await expect(current).not.toHaveText(originalWeek)
        await previous.click()
        await expect(current).toHaveText(originalWeek)
        await expect(selector.getByRole('radio', { name: words.calendar.view.week, exact: true })).toBeChecked()
        await page.getByRole('button', { name: words.calendar.options, exact: true }).click()
        await page.getByRole('menuitem', { name: words.calendar.legendTitle, exact: true }).click()
        const legend = page.getByRole('dialog', { name: words.calendar.legendTitle, exact: true })
        await expectLegendFits(legend, [words.calendar.legend.full, words.calendar.legend.partial, words.calendar.legend.none, words.calendar.legend.loggable])
      })

      test('range label and both chevrons share one row and retain the range while paging', async ({ page }) => {
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.range, exact: true }).click()
        const previous = page.getByRole('button', { name: words.calendar.range.previous, exact: true })
        const next = page.getByRole('button', { name: words.calendar.range.next, exact: true })
        const row = previous.locator('xpath=ancestor::div[p][1]')
        const label = row.locator('p')
        await markRequiredLabels(label)
        await expectLabelsFit(page, row)
        const initialRange = await label.innerText()
        const labelBox = await bounds(label)
        for (const control of [previous, next]) {
          const box = await bounds(control)
          expect(Math.abs(labelBox.center - box.center)).toBeLessThanOrEqual(2)
          expect(box.left).toBeGreaterThan(labelBox.right)
          expect(box.width).toBeGreaterThanOrEqual(48)
          expect(box.height).toBeGreaterThanOrEqual(48)
        }
        await expect(next).toBeDisabled()
        await expectInteractionFill(previous)
        await previous.click()
        await expect(label).not.toHaveText(initialRange)
        await expectInteractionFill(next)
        await next.click()
        await expect(label).toHaveText(initialRange)
        await expect(next).toBeDisabled()
        await expect(page.getByRole('radio', { name: words.calendar.view.range, exact: true })).toBeChecked()
      })
    })
  }
}

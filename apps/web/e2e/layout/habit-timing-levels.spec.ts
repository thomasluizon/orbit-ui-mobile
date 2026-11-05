import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { readReminderChipGeometry } from './habit-timing-geometry'

async function expectWholeCaption(control: Locator) {
  const fits = await control.locator('[data-slot="list-row-title"]').evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    return [...range.getClientRects()].every(line => line.left >= bounds.left - 1 && line.right <= bounds.right + 1)
  })
  expect(fits).toBe(true)
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`timing levels in ${locale}/${colorScheme}`, () => {
      test.use({ appLocale: locale, colorScheme, layoutProfile: profileSchema.parse({ ...profileFixture, language: locale, themePreference: colorScheme }) })
      for (const width of [320, 1280]) {
        for (const textScale of [1, 2]) {
          test(`contains switch and chip paint at ${width}px and ${textScale} text`, async ({ page, context }) => {
            await page.setViewportSize({ width, height: 915 })
            const habit = habitDetailSchema.parse({
              ...makeHabitDetail(), dueTime: '08:00:00', dueEndTime: '09:00:00', reminderEnabled: true,
              reminderTimes: [0, 15, 30], scheduledReminders: [{ when: 'day_before', time: '18:00:00' }],
            })
            await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, (route) => route.fulfill({ json: habit }))
            await page.goto('/habits/habit-1')
            await page.addStyleTag({ content: `html { font-size: ${16 * textScale}px; }` })
            const messages = locale === 'en' ? en : ptBR
            await page.getByRole('button', { name: messages.habits.editHabit }).click()
            const editor = page.getByRole('dialog', { name: messages.habits.editHabit, exact: true })
            const entry = editor.getByRole('button', { name: new RegExp(messages.habits.form.timingAndReminder) })
            await entry.scrollIntoViewIfNeeded()
            await page.evaluate(() => document.fonts.ready)
            await expectWholeCaption(entry)
            await entry.click()
            const timing = page.getByRole('dialog', { name: messages.habits.form.timingAndReminder, exact: true })
            const reminder = timing.getByRole('switch', { name: messages.habits.form.reminder, exact: true })
            await reminder.scrollIntoViewIfNeeded()
            await reminder.hover()
            const edge = await reminder.evaluate(element => {
              const bounds = element.closest('fieldset')!.getBoundingClientRect()
              const fill = element.querySelector('[data-press-fill]')!.getBoundingClientRect()
              const target = element.getBoundingClientRect()
              return { left: fill.left - bounds.left, right: bounds.right - fill.right, targetLeft: target.left - bounds.left, targetRight: bounds.right - target.right }
            })
            expect(Math.abs(edge.left)).toBeLessThanOrEqual(1)
            expect(Math.abs(edge.right)).toBeLessThanOrEqual(1)
            expect(Math.abs(edge.targetLeft)).toBeLessThanOrEqual(1)
            expect(Math.abs(edge.targetRight)).toBeLessThanOrEqual(1)
            const add = timing.getByRole('button', { name: messages.habits.form.reminderAdd, exact: true })
            await expect(add).toHaveText(messages.habits.form.reminderAdd)
            await expectWholeCaption(add)
            const groups = timing.locator('[data-reminder-chips]')
            await expect(groups).toHaveCount(2)
            await expect(groups.nth(0).getByRole('button')).toHaveCount(habit.reminderTimes.length)
            await expect(groups.nth(1).getByRole('button')).toHaveCount(habit.scheduledReminders!.length)
            const chips = timing.locator('[data-reminder-chip]')
            const captions = await chips.allTextContents()
            for (const chip of await chips.all()) {
              const remove = chip.getByRole('button')
              await chip.scrollIntoViewIfNeeded()
              await remove.hover()
              const geometry = await remove.evaluate(readReminderChipGeometry)
              for (const edge of [geometry.left, geometry.right, geometry.top, geometry.bottom]) expect(edge).toBeGreaterThanOrEqual(8)
              expect(geometry.clipped).toBe(false)
              expect(geometry.fits).toBe(true)
            }
            await reminder.click()
            await expect(timing.getByRole('radiogroup', { name: messages.habits.form.reminderKind })).toHaveCount(0)
            await reminder.click()
            await expect(timing.getByRole('radiogroup', { name: messages.habits.form.reminderKind })).toBeVisible()
            await expect(groups).toHaveCount(2)
            await expect(groups.nth(0).getByRole('button')).toHaveCount(habit.reminderTimes.length)
            await expect(groups.nth(1).getByRole('button')).toHaveCount(habit.scheduledReminders!.length)
            await expect(chips).toHaveText(captions)
          })
        }
      }
    })
  }
}

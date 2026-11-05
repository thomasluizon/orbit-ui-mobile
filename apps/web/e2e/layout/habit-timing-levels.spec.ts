import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

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
            await editor.getByRole('button', { name: new RegExp(messages.habits.form.timingAndReminder) }).click()
            const timing = page.getByRole('dialog', { name: messages.habits.form.timingAndReminder, exact: true })
            const reminder = timing.getByRole('switch', { name: messages.habits.form.reminder, exact: true })
            await reminder.scrollIntoViewIfNeeded()
            await reminder.hover()
            const edge = await reminder.evaluate(element => {
              const bounds = element.closest('fieldset')!.getBoundingClientRect()
              const fill = element.querySelector('[data-press-fill]')!.getBoundingClientRect()
              return { left: fill.left - bounds.left, right: bounds.right - fill.right }
            })
            expect(Math.abs(edge.left)).toBeLessThanOrEqual(1)
            expect(Math.abs(edge.right)).toBeLessThanOrEqual(1)
            const add = timing.getByRole('button', { name: messages.habits.form.reminderAdd, exact: true })
            await expect(add).toHaveText(messages.habits.form.reminderAdd)
            for (const label of [messages.habits.form.removeReminder, messages.habits.form.removeScheduledReminder]) {
              const removes = timing.getByRole('button', { name: label, exact: true })
              expect(await removes.count()).toBeGreaterThan(0)
              for (const remove of await removes.all()) {
                await remove.scrollIntoViewIfNeeded()
                await remove.hover()
                const geometry = await remove.evaluate(element => {
                  const target = element.getBoundingClientRect()
                  const chip = element.parentElement!.getBoundingClientRect()
                  let bottom = Infinity
                  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
                    if (getComputedStyle(ancestor).overflowY !== 'visible') bottom = Math.min(bottom, ancestor.getBoundingClientRect().bottom)
                  }
                  const frame = element.closest('fieldset')!.getBoundingClientRect()
                  return { left: target.left - chip.left, right: chip.right - target.right, top: target.top - chip.top, bottom: chip.bottom - target.bottom, clipped: chip.bottom > bottom + 1, fits: chip.left >= frame.left - 1 && chip.right <= frame.right + 1 }
                })
                for (const edge of [geometry.left, geometry.right, geometry.top, geometry.bottom]) expect(edge).toBeGreaterThanOrEqual(8)
                expect(geometry.clipped).toBe(false)
                expect(geometry.fits).toBe(true)
              }
            }
            await reminder.click()
            await expect(timing.getByRole('radiogroup', { name: messages.habits.form.reminderKind })).toHaveCount(0)
            await reminder.click()
            await expect(timing.getByRole('radiogroup', { name: messages.habits.form.reminderKind })).toBeVisible()
            expect(await timing.getByRole('button', { name: messages.habits.form.removeReminder, exact: true }).count()).toBe(3)
          })
        }
      }
    })
  }
}

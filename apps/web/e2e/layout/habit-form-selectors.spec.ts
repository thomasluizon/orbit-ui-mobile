import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [360, 412, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test.describe(`form decisions ${locale} ${width}px ${theme}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 1000 }, layoutProfile: { themePreference: theme } })
        test('keeps decisions ordered and timing inside its named sheet', async ({ page }) => {
          const messages = locale === 'en' ? en : ptBR
          await page.goto('/habits/new')
          const screen = page.locator('[data-habit-create-screen]')
          await expect(screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeTask) })).toBeChecked()
          await expect(page.getByRole('heading', { name: messages.habits.form.newTask, exact: true })).toHaveCSS('font-size', '22px')
          await expect(page.getByRole('button', { name: messages.habits.createTask, exact: true })).toBeVisible()
          const title = screen.getByRole('textbox', { name: messages.habits.form.taskDescribe, exact: true })
          await title.fill('Read')
          const description = screen.getByRole('textbox', { name: messages.habits.form.description, exact: true })
          await expect(description).toHaveAttribute('rows', '1')
          const descriptionHeight = (await description.boundingBox())!.height
          await description.fill('First line\nSecond line\nThird line\nFourth line')
          await expect(async () => expect((await description.boundingBox())!.height).toBeGreaterThan(descriptionHeight)).toPass()
          await screen.getByRole('radio', { name: new RegExp(messages.habits.form.typeHabit) }).click()
          const when = screen.getByRole('textbox', { name: messages.habits.form.datePhrase, exact: true })
          const frequency = screen.getByRole('radiogroup', { name: messages.habits.form.frequency, exact: true })
          const timing = screen.getByRole('button', { name: new RegExp(messages.habits.form.timingAndReminder) })
          const whenBox = (await when.boundingBox())!
          const frequencyBox = (await frequency.boundingBox())!
          const timingBox = (await timing.boundingBox())!
          expect(frequencyBox.y).toBeGreaterThan(whenBox.y + whenBox.height)
          expect(timingBox.y).toBeGreaterThan(frequencyBox.y + frequencyBox.height)
          await timing.click()
          const sheet = page.getByRole('dialog', { name: messages.habits.form.timingAndReminder, exact: true })
          await expect(sheet.getByRole('textbox', { name: messages.habits.form.dueEndTime, exact: true })).toHaveCount(0)
          await sheet.getByRole('textbox', { name: messages.habits.form.exactTime, exact: true }).fill('08:00')
          await expect(sheet.getByRole('textbox', { name: messages.habits.form.dueEndTime, exact: true })).toBeVisible()
          const enabled = sheet.getByRole('switch', { name: messages.habits.form.reminder, exact: true })
          if (await enabled.getAttribute('aria-checked') !== 'true') await enabled.click()
          await expect(sheet.getByRole('radio', { name: messages.habits.form.definedTimes, exact: true })).toBeChecked()
          await sheet.getByRole('radio', { name: messages.habits.form.repeatEvery, exact: true }).click()
          await expect(sheet.getByRole('combobox', { name: messages.habits.form.repeatEvery, exact: true })).toBeVisible()
          const bounds = await sheet.evaluate((element) => {
            const box = element.getBoundingClientRect()
            return { left: box.left, right: box.right, scrollWidth: document.documentElement.scrollWidth }
          })
          expect(bounds.left).toBeGreaterThanOrEqual(0)
          expect(bounds.right).toBeLessThanOrEqual(width)
          expect(bounds.scrollWidth).toBeLessThanOrEqual(width)
          await sheet.getByRole('button', { name: messages.common.done, exact: true }).click()
          await screen.getByRole('button', { name: messages.habits.form.moreDetails, exact: true }).click()
          for (const key of ['steps', 'avoidGroup', 'organize', 'ending'] as const) {
            await expect(screen.getByRole('heading', { name: messages.habits.form[key], exact: true })).toBeVisible()
          }
        })
      })
    }
  }
}

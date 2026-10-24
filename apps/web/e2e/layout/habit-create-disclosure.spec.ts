import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [412, 1280]) {
    test.describe(`habit create disclosure in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('announces its state and names the reminders region', async ({ page }) => {
        await page.goto('/habits/new')
        const messages = locale === 'en' ? en : ptBr
        const screen = page.locator('[data-habit-create-screen]')
        const disclosure = screen.getByRole('button', { name: messages.habits.form.moreDetails, exact: true })
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

        await disclosure.click()
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
        await expect(disclosure).toHaveAttribute('aria-controls', /\S+/)
        const regionId = await disclosure.getAttribute('aria-controls')
        const region = screen.locator(`[id=${JSON.stringify(regionId)}]`)
        await expect(region).toHaveCount(1)
        await expect(region.getByRole('heading', { name: messages.habits.form.reminders, exact: true })).toBeVisible()

        await disclosure.click()
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      })
    })
  }
}

for (const locale of ['pt-BR', 'en'] as const) {
  for (const width of [320, 360, 384, 412, 1352]) {
    for (const mode of ['dark', 'light'] as const) {
      for (const scale of [1, 2]) {
        test.describe(`restored habit form ${locale} ${mode} ${width}px ${scale}x`, () => {
          test.use({ appLocale: locale, layoutProfile: { themePreference: mode }, viewport: { width, height: 1000 } })
          test('keeps required type, local date, recovery and accepted proposal controls distinct', async ({ page }) => {
            await page.goto('/habits/new')
            const messages = locale === 'en' ? en : ptBr
            if (scale === 2) await page.addStyleTag({ content: ':root{font-size:32px!important}' })
            await page.evaluate(() => document.fonts.ready)
            const screen = page.locator('[data-habit-create-screen]')
            const submit = page.locator('[data-habit-create-action]').getByRole('button', { name: messages.habits.createHabit, exact: true })
            await expect(submit).toBeEnabled()
            await submit.click()
            const task = screen.getByRole('radio', { name: messages.habits.form.typeTask, exact: true })
            await expect(task).toBeFocused()
            await expect(screen.getByText(messages.habits.form.typeRequired, { exact: true })).toBeVisible()
            await task.click()
            await screen.getByRole('textbox', { name: messages.habits.form.describe, exact: true }).fill('Read every Monday')
            const phrase = screen.getByRole('textbox', { name: messages.habits.form.datePhrase, exact: true })
            const date = screen.getByRole('button', { name: new RegExp(messages.habits.form.taskDate) })
            await expect(date).toBeVisible()
            await expect(screen.getByRole('button', { name: messages.habits.form.moreDetails, exact: true })).toHaveAttribute('aria-expanded', 'false')
            await phrase.fill(locale === 'en' ? 'on the 26th' : 'dia 26')
            await expect(screen.getByRole('button', { name: messages.habits.form.suggestDate, exact: true })).toHaveCount(0)
            await phrase.fill(locale === 'en' ? 'February 31' : '31 de fevereiro')
            await expect(phrase).toHaveAttribute('aria-invalid', 'true')
            await expect(screen.getByRole('button', { name: messages.habits.form.suggestDate, exact: true })).toHaveCount(0)
            await submit.click()
            await expect(phrase).toBeFocused()
            await phrase.fill(locale === 'en' ? 'after vacation' : 'depois das férias')
            const ask = screen.getByRole('button', { name: messages.habits.form.suggestDate, exact: true })
            await ask.click()
            const accept = screen.getByRole('button', { name: messages.habits.form.acceptDate, exact: true })
            await expect(accept).toBeVisible()
            await expect(screen.locator('[data-habit-date-field] [role="status"]')).toHaveText(messages.habits.form.dateProposed)
            await accept.focus()
            await accept.click()
            await expect(date).toBeFocused()
            await expect(phrase).toHaveValue('')
            await expect(phrase).not.toHaveAttribute('aria-invalid', 'true')
            await screen.getByRole('radio', { name: messages.habits.form.typeHabit, exact: true }).click()
            await screen.getByRole('button', { name: messages.habits.form.moreDetails, exact: true }).click()
            await screen.getByRole('radio', { name: new RegExp(messages.habits.form.noSchedule) }).click()
            await expect(screen.locator('[data-habit-date-field]')).toHaveCount(0)
            await screen.getByRole('radio', { name: messages.habits.form.every, exact: true }).click()
            await expect(screen.getByRole('button', { name: new RegExp(messages.habits.form.habitStartDate) })).toBeVisible()
            const geometry = await screen.evaluate((element) => ({
              scroll: document.documentElement.scrollWidth,
              viewport: innerWidth,
              controls: Array.from(element.querySelectorAll('[role="radio"], [data-habit-date-field] button')).map((control) => {
                const bounds = control.getBoundingClientRect()
                return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right }
              }),
            }))
            expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport + 1)
            for (const control of geometry.controls) {
              expect(control.width).toBeGreaterThanOrEqual(48)
              expect(control.height).toBeGreaterThanOrEqual(48)
              expect(control.left).toBeGreaterThanOrEqual(0)
              expect(control.right).toBeLessThanOrEqual(width)
            }
          })
        })
      }
    }
  }
}

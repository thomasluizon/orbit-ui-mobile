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

import { expect } from '@playwright/test'
import { test } from './upgrade-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'

for (const locale of ['en', 'pt-BR'] as const) {
  const messages = locale === 'en' ? en : ptBr
  for (const width of [412, 1352] as const) {
    test.describe(`habit create reason in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('keeps the empty-words reason beneath and aligned with its field', async ({ page }) => {
        await page.goto('/habits/new')
        const field = page.getByRole('textbox', { name: messages.habits.flow.what.label, exact: true })
        await expect(field).toBeVisible()
        await page.getByRole('button', { name: messages.habits.flow.continue, exact: true }).click()
        const reasonId = await field.getAttribute('aria-describedby')
        expect(reasonId).toBeTruthy()
        const reason = page.locator(`[id="${reasonId}"]`)
        await expect(reason).toHaveText(messages.habits.flow.what.hint)
        await page.evaluate(() => document.fonts.ready)
        await expect(async () => {
          const perimeter = (await field.evaluate((element) => {
            const bounds = element.closest('[data-focus-perimeter]')!.getBoundingClientRect()
            return { x: bounds.x, bottom: bounds.bottom, width: bounds.width }
          }))
          const geometry = await reason.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const text = range.getBoundingClientRect()
            return { top: element.getBoundingClientRect().top, textStart: text.left }
          })
          expect(geometry.top).toBeGreaterThanOrEqual(perimeter.bottom)
          expect(geometry.textStart).toBeGreaterThanOrEqual(perimeter.x)
          expect(geometry.textStart).toBeLessThanOrEqual(perimeter.x + perimeter.width)
        }).toPass()

        await field.fill('Walk')
        await expect(reason).toHaveCount(0)
        await expect(field).not.toHaveAttribute('aria-describedby', reasonId!)
      })
    })
  }
}

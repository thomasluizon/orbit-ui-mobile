import { expect } from '@playwright/test'
import { test } from './upgrade-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'

for (const locale of ['en', 'pt-BR'] as const) {
  const messages = locale === 'en' ? en : ptBr
  for (const width of [412, 1352] as const) {
    test.describe(`habit create reason in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('keeps the empty reason beneath and aligned with its submit', async ({ page }) => {
        await page.goto('/habits/new')
        const footer = page.locator('[data-habit-create-action]')
        const submit = footer.getByRole('button', { name: messages.habits.createHabit, exact: true })
        await expect(submit).toBeDisabled()
        const reasonId = await submit.getAttribute('aria-describedby')
        expect(reasonId).toBeTruthy()
        const reason = page.locator(`[id="${reasonId}"]`)
        await expect(reason).toHaveText(messages.habits.form.createWhy)
        await page.evaluate(() => document.fonts.ready)
        await expect(async () => {
          const buttonBox = await submit.boundingBox()
          expect(buttonBox).not.toBeNull()
          const geometry = await reason.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const range = document.createRange()
            range.selectNodeContents(element)
            const text = range.getBoundingClientRect()
            return { top: bounds.top, width: bounds.width, textStart: text.left, textCenter: text.left + text.width / 2 }
          })
          expect(geometry.top).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height)
          if (width === 412) {
            expect(buttonBox!.width).toBeCloseTo(geometry.width, 1)
            expect(geometry.textCenter).toBeCloseTo(buttonBox!.x + buttonBox!.width / 2, 1)
          } else {
            expect(buttonBox!.width).toBeLessThan(geometry.width)
            expect(geometry.textStart).toBeCloseTo(buttonBox!.x, 1)
          }
        }).toPass()

        await page.getByRole('textbox', { name: messages.habits.form.describe, exact: true }).fill('Walk')
        await expect(submit).toBeEnabled()
        await expect(submit).not.toHaveAttribute('aria-describedby')
        await expect(reason).toHaveCount(0)
      })
    })
  }
}

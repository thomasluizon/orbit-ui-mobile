import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { expectLabelsFit } from './label-fit-contract'

for (const width of [320, 360, 384, 412, 600, 768, 840, 1024, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`habit views in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('keeps the view switch whole and shows the pager only in Hoje', async ({ page }) => {
        await page.goto('/')
        const control = page.getByRole('radiogroup', { name: words.habits.viewsLabel })
        await expect(control).toBeVisible()
        for (const label of [words.habits.viewToday, words.habits.viewAll, words.habits.viewGeneral]) {
          const radio = control.getByRole('radio', { name: label, exact: true })
          await radio.click()
          await expect(radio).toHaveAttribute('aria-checked', 'true')
          await expectLabelsFit(page, control)
          const positions = await control.getByRole('radio').evaluateAll((radios) => radios.map((radio) => radio.getBoundingClientRect().top))
          expect(new Set(positions).size).toBe(1)
          if (label === words.habits.viewToday) await expect(page.locator('[data-today-date-row]')).toBeVisible()
          else await expect(page.locator('[data-today-date-row]')).toHaveCount(0)
        }
        await page.reload()
        await expect(control.getByRole('radio', { name: words.habits.viewGeneral, exact: true })).toHaveAttribute('aria-checked', 'true')
      })
    })
  }
}

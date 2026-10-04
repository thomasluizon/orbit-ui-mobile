import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { expectLabelsFit } from './label-fit-contract'
import { test } from './upgrade-fixtures'

for (const width of [1100, 1440]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`sidebar visual line count in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })

      test('counts the search label and shortcut as one visual line', async ({ page }) => {
        await page.goto('/profile')
        const sidebar = page.locator('[data-shell-sidebar]')
        await expect(sidebar).toBeVisible()
        const search = sidebar.getByRole('button', { name: new RegExp(words.nav.search) })
        await expect(search.getByText(words.nav.search, { exact: true })).toBeVisible()
        await expect(search.locator('kbd')).toBeVisible()
        await expectLabelsFit(page, sidebar)
      })
    })
  }
}

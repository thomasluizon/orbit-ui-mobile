import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { test } from './upgrade-fixtures'

for (const width of [600, 840, 1100, 1352]) for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`personal account row height at ${width}px in ${locale}`, () => {
    const words = locale === 'en' ? en : ptBR
    const profile = profileSchema.parse({ ...profileFixture, name: 'Ana Silva', email: 'ana@example.com', language: locale })
    test.use({ viewport: { width, height: 915 }, appLocale: locale, layoutProfile: profile })

    test('keeps Conta and Perfil at the two-line row height', async ({ page }) => {
      await page.goto('/profile')
      const navigation = page.getByRole('link', { name: words.profile.submenus.accountLabel.replace('{name}', profile.name!).replace('{email}', profile.email), exact: true })
      await expect(navigation).toBeVisible()
      const navigationHeight = await navigation.locator('..').evaluate((row) => row.getBoundingClientRect().height)
      await navigation.click()
      await expect(page).toHaveURL(/\/profile\/account$/)
      const account = page.getByRole('button', { name: words.profile.settingsRows.editName.replace('{name}', profile.name!).replace('{email}', profile.email), exact: true })
      await expect(account).toBeVisible()
      const accountHeight = await account.locator('..').evaluate((row) => row.getBoundingClientRect().height)
      expect(navigationHeight).toBe(68)
      expect(accountHeight).toBe(68)
      expect(accountHeight).toBe(navigationHeight)
    })
  })
}

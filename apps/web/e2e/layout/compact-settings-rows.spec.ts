import { expect, type Locator } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

async function assertCompactTarget(row: Locator) {
  const bounds = await row.evaluate((element) => {
    const rectangle = element.getBoundingClientRect()
    return {
      height: rectangle.height,
      width: rectangle.width,
      clipped: element.scrollWidth > element.clientWidth,
      paddingStart: parseFloat(getComputedStyle(element).paddingInlineStart),
    }
  })
  expect(bounds.height).toBe(52)
  expect(bounds.width).toBeGreaterThanOrEqual(44)
  expect(bounds.clipped).toBe(false)
  expect(bounds.paddingStart).toBe(16)
}

for (const width of [412, 1280]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : ptBR
    test.describe(`Compact settings rows at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale })

      test('Sobre keeps all four destinations at the drawn height', async ({ page }) => {
        await page.goto('/about')
        const content = page.locator('#orbit-main').getByTestId('about-content')
        await expect(content).toBeVisible()
        const destinations = content.getByTestId('about-destinations')
        await expect(destinations.getByRole('button')).toHaveCount(4)
        const labels = [messages.about.featureGuide, messages.about.support, messages.about.terms, messages.about.privacy]
        for (const label of labels) {
          const row = destinations.getByRole('button', { name: label, exact: true })
          await row.scrollIntoViewIfNeeded()
          await expect(row).toBeVisible()
          await assertCompactTarget(row)
          await expect(row.locator('svg')).toHaveCount(1)
        }
      })

      test('Perfil opens plain preference rows and keeps export in Conta', async ({ page }) => {
        await page.goto('/profile')
        const navigation = page.getByTestId('profile-settings-group-you')
        await expect(navigation.getByRole('link')).toHaveCount(5)
        await expect(navigation.locator('svg')).toHaveCount(5)
        const proEntry = navigation.getByRole('link', { name: new RegExp(`^${messages.upgrade.pitchTitle}`) })
        await expect(proEntry).toHaveAttribute('href', '/upgrade')
        await assertCompactTarget(proEntry)
        await navigation.getByRole('link', { name: messages.profile.submenus.preferences, exact: true }).click()
        const group = page.getByTestId('profile-settings-group-preferences')
        const rows = group.locator('.orbit-list-row-shell')
        await expect(rows).toHaveCount(4)
        const labels = [messages.profile.settingsRows.timezone, messages.profile.settingsRows.weekStart, messages.settings.clock.title, messages.profile.language.title]
        for (const [index, label] of labels.entries()) {
          const row = rows.nth(index).getByRole('button')
          await expect(row).toContainText(label)
          await expect(row.locator('svg')).toHaveCount(0)
          await row.scrollIntoViewIfNeeded()
          await expect(row).toBeVisible()
          await assertCompactTarget(row)
        }
        await page.getByRole('button', { name: messages.common.backToProfile, exact: true }).click()
        await page.locator('a[href="/profile/account"]').click()
        const exportRow = page.getByTestId('profile-settings-group-account').getByRole('button', { name: messages.profile.settingsRows.export, exact: true })
        await expect(exportRow.locator('svg')).toHaveCount(1)
        await assertCompactTarget(exportRow)
      })
    })
  }
}

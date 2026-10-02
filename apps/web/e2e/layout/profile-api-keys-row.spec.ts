import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  test.describe(`Profile API key row in ${locale}`, () => {
    test.use({ viewport: { width: 412, height: 915 }, appLocale: locale, subscriptionState: 'stripe' })

    for (const count of [0, 1, 3]) {
      test(`keeps the title and meta separated for ${count} keys`, async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale, hasProAccess: true, activeApiKeyCount: count })
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        await page.goto('/profile')
        const keys = page.getByTestId('profile-api-keys')
        const messages = locale === 'en' ? en : ptBR
        const title = keys.locator('[data-slot="list-row-title"]')
        const value = keys.locator('[data-slot="list-row-value"]')
        await expect(title).toHaveText(messages.profile.apiKeys.open)
        await expect(value).toHaveText(count === 0 ? messages.profile.apiKeys.noKeys : new RegExp(`^${count} `))
        await expect(value).toHaveCSS('font-size', '12px')
        await expect(value).toHaveCSS('line-height', '16.8px')
        await expect(value).toHaveCSS('letter-spacing', '0.24px')
        await page.evaluate(() => document.fonts.ready)
        const measured = await keys.evaluate((section) => {
          const titleElement = section.querySelector('[data-slot="list-row-title"]')!
          const valueElement = section.querySelector('[data-slot="list-row-value"]')!
          const titleBox = titleElement.getBoundingClientRect()
          const valueBox = valueElement.getBoundingClientRect()
          const titleRange = document.createRange()
          titleRange.selectNodeContents(titleElement)
          const valueRange = document.createRange()
          valueRange.selectNodeContents(valueElement)
          const stacked = valueBox.top >= titleBox.bottom
          return {
            gap: stacked ? valueBox.top - titleBox.bottom : valueBox.left - titleBox.right,
            titleLines: titleRange.getClientRects().length,
            valueLines: valueRange.getClientRects().length,
            contained: titleBox.left >= 0 && valueBox.right <= innerWidth,
          }
        })
        expect(measured.gap).toBeGreaterThanOrEqual(12)
        expect(measured.titleLines).toBe(1)
        expect(measured.valueLines).toBe(1)
        expect(measured.contained).toBe(true)
      })
    }
  })
}

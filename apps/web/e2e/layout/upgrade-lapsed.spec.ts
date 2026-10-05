import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { subscriptionFixtures, test } from './upgrade-fixtures'

const exhaustedLapsedSubscription = subscriptionStatusSchema.parse({
  ...subscriptionFixtures.lapsed,
  aiMessagesUsed: 5,
  aiMessagesLimit: 5,
})

for (const [locale, messages] of [['pt-BR', ptBr], ['en', en]] as const) {
  for (const width of [412, 1280] as const) {
    test.describe(`${locale} lapsed at capacity at ${width}px`, () => {
      test.use({
        appLocale: locale,
        subscriptionState: 'lapsed',
        layoutProfile: exhaustedLapsedSubscription,
        viewport: { width, height: 1400 },
      })

      test('shows the lost entitlements without usage or capacity notices', async ({ page }) => {
        await page.route(`${LAYOUT_ORIGIN}${API.subscription.status}`, (route) =>
          route.fulfill({ json: exhaustedLapsedSubscription }),
        )
        await page.goto('/upgrade')
        const upgradeScreen = page.locator('[data-upgrade-screen]')
        await expect(upgradeScreen.getByRole('heading', { name: messages.upgrade.billing.lapsed.title, exact: true })).toBeVisible()
        for (const line of [
          messages.upgrade.billing.lapsed.lostMessages.replace('{limit}', '5'),
          messages.upgrade.billing.lapsed.lostCalendar,
          messages.upgrade.billing.lapsed.lostRetrospective,
        ]) {
          await expect(upgradeScreen.getByText(line, { exact: true })).toBeVisible()
        }
        await expect(upgradeScreen.getByRole('progressbar')).toHaveCount(0)
        await expect(upgradeScreen.getByText(messages.upgrade.billing.usage.title, { exact: true })).toHaveCount(0)
        await expect(upgradeScreen.getByText(messages.upgrade.billing.usage.nearLimit, { exact: true })).toHaveCount(0)
      })
    })
  }
}

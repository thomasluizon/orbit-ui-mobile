import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

for (const width of [320, 360, 384, 412]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`Perfil notification labels at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale })

      for (const consent of [null, true, false]) {
        test(`keeps labels whole and groups 24px apart with email consent ${consent}`, async ({ page, context }) => {
          const profile = profileSchema.parse({ ...profileFixture, language: locale, marketingEmailConsent: consent })
          await setLayoutProfileSession(context, profile)
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
          await page.goto('/profile/notifications')
          const words = locale === 'en' ? en : ptBR
          const group = page.getByTestId('profile-settings-group-notifications')
          const device = group.getByRole('switch', { name: words.profile.settingsRows.alertsOnThisDevice, exact: true })
          await expect(device).toBeVisible()
          const titles = group.locator('[data-slot="list-row-title"]')
          await markRequiredLabels(titles)
          await expectLabelsFit(page, group)
          const bounds = await group.locator(':scope > div').evaluate((content) => {
            const email = content.children[0]!.getBoundingClientRect()
            const device = content.children[1]!.getBoundingClientRect()
            return { gap: device.top - email.bottom }
          })
          expect(bounds.gap).toBe(24)
        })
      }
    })
  }
}

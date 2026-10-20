import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

async function expectSwitchCentred(control: Locator) {
  await expect(control).toBeVisible()
  const geometry = await control.evaluate((element) => {
    const row = element.closest('.orbit-list-row-shell') ?? element.parentElement!.parentElement!
    const label = row.querySelector('[data-slot="settings-row-label"], [data-slot="list-row-title"]')!
    const labelBounds = label.getBoundingClientRect()
    const switchBounds = element.getBoundingClientRect()
    return {
      height: row.getBoundingClientRect().height,
      centreOffset: labelBounds.top + labelBounds.height / 2 - switchBounds.top - switchBounds.height / 2,
      labelHeight: labelBounds.height,
      lineHeight: parseFloat(getComputedStyle(label).lineHeight),
    }
  })
  expect(geometry.labelHeight).toBeCloseTo(geometry.lineHeight, 0)
  expect(Math.abs(geometry.centreOffset)).toBeLessThanOrEqual(1)
  expect(geometry.height).toBe(52)
}

for (const width of [412, 1280]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`Settings switch centres at ${width}px in ${locale}`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, hasProAccess: true,
        isTrialActive: false, aiSummaryEnabled: true, proactiveAstraEnabled: true })
      test.use({ viewport: { width, height: 915 }, appLocale: locale, subscriptionState: 'stripe', layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
      })

      test('centres the Conta usage analytics label', async ({ page }) => {
        await page.goto('/profile/account')
        const control = page.getByRole('switch', { name: words.profile.analytics.title, exact: true })
        await expect(control).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await expectSwitchCentred(control)
      })

      test('centres both Astra switch labels', async ({ page }) => {
        await page.goto('/profile/astra')
        await expect(page.getByRole('switch')).toHaveCount(2)
        await page.evaluate(() => document.fonts.ready)
        for (const label of [words.profile.proactiveAstra.title, words.profile.aiSummary.title]) {
          await expectSwitchCentred(page.getByRole('switch', { name: label, exact: true }))
        }
      })
    })
  }
}

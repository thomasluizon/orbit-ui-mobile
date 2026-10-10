import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    for (const hasProAccess of [false, true]) {
      test.describe(`Perfil Astra in ${locale} at ${width}px, Pro ${hasProAccess}`, () => {
        const profile = profileSchema.parse({
          ...profileFixture, language: locale, hasProAccess, isTrialActive: false,
          aiSummaryEnabled: true, proactiveAstraEnabled: true,
          aiMessagesUsed: 0, aiMessagesLimit: 15,
        })
        test.use({
          appLocale: locale, subscriptionState: hasProAccess ? 'stripe' : 'free',
          viewport: { width, height: 915 }, layoutProfile: profile,
        })
        test.beforeEach(async ({ context }) => {
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        })

        test('keeps allowance and feature titles whole with matching group spacing', async ({ page }) => {
          await page.goto('/profile/astra')
          const allowance = page.getByTestId('astra-allowance-panel')
          const groups = allowance.locator('..')
          for (const label of [words.profile.allowance.title, words.profile.proactiveAstra.title, words.profile.aiSummary.title]) {
            await markRequiredLabels(groups.getByText(label, { exact: true }))
          }
          await markRequiredLabels(allowance.getByText(words.profile.allowance.usage.replace('{used}', '0').replace('{limit}', '15'), { exact: true }))
          await expect(groups.getByRole('switch')).toHaveCount(hasProAccess ? 2 : 0)
          await expectLabelsFit(page, groups)
          const spacing = await allowance.evaluate((panel) => {
            const settings = panel.nextElementSibling!
            const panelBox = panel.getBoundingClientRect()
            const row = settings.querySelector<HTMLElement>('[data-slot="list-row-title"]')!.closest('.orbit-list-row-shell')!.firstElementChild!
            return { gap: settings.getBoundingClientRect().top - panelBox.bottom, allowanceInset: getComputedStyle(panel).paddingLeft, settingsInset: getComputedStyle(row).paddingLeft }
          })
          expect(spacing).toEqual({ gap: 24, allowanceInset: '16px', settingsInset: '16px' })
          if (!hasProAccess) for (const label of [words.profile.proactiveAstra.title, words.profile.aiSummary.title]) {
            await expectInteractionFill(groups.getByRole('button', { name: new RegExp(label) }))
          }
        })
      })
    }
  }
}

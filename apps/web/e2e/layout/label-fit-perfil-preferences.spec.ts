import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} Perfil preferences at ${width}px`, () => {
      const profile = profileSchema.parse({
        ...profileFixture, language: locale, timeZone: 'America/Sao_Paulo',
        weekStartDay: 1, uses24HourClock: true,
      })
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profile })

      test('keeps every preference title and value whole', async ({ page, context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.profile.get,
          (route) => route.fulfill({ json: profile }))
        await page.goto('/profile/preferences')
        const surface = page.getByTestId('profile-settings-group-preferences')
        await expect(surface.locator('[data-slot="list-row-title"]')).toHaveCount(6)
        await expect(surface.locator('[data-slot="list-row-value"]')).toHaveCount(4)
        for (const label of [
          words.profile.settingsRows.timezone, profile.timeZone!,
          words.profile.settingsRows.weekStart, words.dates.daysValue.monday,
          words.settings.clock.title, words.settings.clock.hour24,
          words.profile.language.title,
          locale === 'pt-BR' ? words.profile.language.brazilianPortuguese : 'English',
          words.profile.settingsRows.theme, words.preferences.themeModeDark,
          words.preferences.themeModeLight, words.settings.homeScreen.showGeneral,
        ]) await markRequiredLabels(surface.getByText(label, { exact: true }))
        await expect(surface.getByRole('switch', { name: words.settings.homeScreen.showGeneral, exact: true })).toBeVisible()
        await expectLabelsFit(page, surface)
        for (const row of await surface.locator('.orbit-list-row-body').all()) await expectInteractionFill(row)
        for (const choice of await surface.getByRole('group', { name: words.profile.settingsRows.theme, exact: true }).getByRole('button').all()) await expectInteractionFill(choice)
      })
    })
  }
}

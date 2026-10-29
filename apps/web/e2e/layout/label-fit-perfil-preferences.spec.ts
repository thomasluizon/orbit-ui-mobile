import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
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
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await page.goto('/profile/preferences')
        const surface = page.getByTestId('profile-settings-group-preferences')
        await expect(surface.locator('[data-slot="list-row-title"]')).toHaveCount(5)
        await expect(surface.locator('[data-slot="list-row-value"]')).toHaveCount(4)
        for (const label of [
          words.profile.settingsRows.timezone, profile.timeZone!,
          words.profile.settingsRows.weekStart, words.dates.daysValue.monday,
          words.settings.clock.title, words.settings.clock.hour24,
          words.profile.language.title,
          locale === 'pt-BR' ? words.profile.language.brazilianPortuguese : 'English',
          words.settings.homeScreen.showGeneral,
        ]) await markRequiredLabels(surface.getByText(label, { exact: true }))
        await expect(surface.getByRole('switch', { name: words.settings.homeScreen.showGeneral, exact: true })).toBeVisible()
        await expectLabelsFit(page, surface.locator('.orbit-list-row-shell').filter({ hasNot: page.getByRole('switch') }))
        const switchRow = surface.locator('.orbit-list-row-shell').filter({ has: page.getByRole('switch') })
        const copy = await switchRow.locator('[data-slot="list-row-title"], [data-slot="list-row-description"]').evaluateAll((elements) => elements.map((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
          const bounds = element.getBoundingClientRect()
          return { text: element.textContent, lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
            clipped: fragments.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) }
        }))
        expect(copy).toHaveLength(2)
        expect(copy[0]).toEqual({ text: words.settings.homeScreen.showGeneral, lines: 1, clipped: false })
        expect(copy[1]).toMatchObject({ text: words.settings.homeScreen.showGeneralDesc, clipped: false })
        expect(copy[1]!.lines).toBeGreaterThan(0)
        expect(copy[1]!.lines).toBeLessThanOrEqual(2)
        for (const row of await surface.locator('.orbit-list-row-body').all()) await expectInteractionFill(row)
      })
    })
  }
}

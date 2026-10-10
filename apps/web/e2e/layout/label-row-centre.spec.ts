import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

async function expectRowCentres(surface: Locator, scale: number) {
  await expect(surface.locator('[data-slot="list-row-title"]')).toHaveCount(6)
  await expect(surface.locator('[data-slot="list-row-value"]')).toHaveCount(4)
  await expect.poll(async () => Math.max(...await surface.locator('.orbit-list-row-shell').evaluateAll((rows, scale) => rows.map((row) => {
    const label = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
    const control = row.querySelector('[data-slot="switch-track"], [role="group"], [data-slot="list-row-value"]')!
    const title = label.getBoundingClientRect()
    const accessory = control.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(label).lineHeight)
    const supportingLine = scale > 1 && accessory.top >= title.bottom
    return supportingLine ? 0 : Math.abs(title.top + Math.min(title.height, lineHeight) / 2 - accessory.top - accessory.height / 2)
  }), scale))).toBeLessThanOrEqual(1)
  const rows = await surface.locator('.orbit-list-row-shell').evaluateAll((rows, scale) => rows.map((row) => {
    const label = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
    const control = row.querySelector('[data-slot="switch-track"], [role="group"], [data-slot="list-row-value"]')!
    const title = label.getBoundingClientRect()
    const accessory = control.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(label).lineHeight)
    return { label: label.textContent, lines: title.height / lineHeight, clipped: label.scrollHeight > label.clientHeight + 1,
      offset: scale > 1 && accessory.top >= title.bottom ? 0 : title.top + Math.min(title.height, lineHeight) / 2 - accessory.top - accessory.height / 2 }
  }), scale)
  for (const row of rows) {
    expect(Math.abs(row.offset), row.label!).toBeLessThanOrEqual(1)
    expect(row.clipped, row.label!).toBe(false)
    if (scale === 1) expect(row.lines, row.label!).toBeCloseTo(1, 1)
  }
}

for (const width of [412, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const mode of ['light', 'dark'] as const) {
      test.describe(`Inline preference centres at ${width}px in ${locale}, ${mode}`, () => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale, themePreference: mode,
          timeZone: 'America/Sao_Paulo', weekStartDay: 1, uses24HourClock: true })
        test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profile })

        test('centres default labels and aligns wrapped labels to their first line at 200% text', async ({ page, context }) => {
          await setLayoutProfileSession(context, profile)
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
          await page.goto('/profile/preferences')
          const surface = page.getByTestId('profile-settings-group-preferences')
          const choices = surface.getByRole('group', { name: words.profile.settingsRows.theme, exact: true })
          await expect(choices.getByRole('button')).toHaveCount(2)
          await page.evaluate(() => document.fonts.ready)
          await expectRowCentres(surface, 1)
          await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
          await expectRowCentres(surface, 2)
          await page.evaluate(() => { document.documentElement.style.fontSize = '' })
          await expectRowCentres(surface, 1)
        })
      })
    }
  }
}

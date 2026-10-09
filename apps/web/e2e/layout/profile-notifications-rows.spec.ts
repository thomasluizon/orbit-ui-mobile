import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

for (const width of [412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`Notification switch rows at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale })

      for (const consent of [true, false]) {
        test(`aligns answered email consent ${consent} with the device switch`, async ({ page, context }) => {
          const profile = profileSchema.parse({ ...profileFixture, language: locale, marketingEmailConsent: consent })
          await setLayoutProfileSession(context, profile)
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
          await page.goto('/profile/notifications')
          const messages = locale === 'en' ? en : ptBR
          const group = page.getByTestId('profile-settings-group-notifications')
          const email = group.getByRole('switch', { name: messages.profile.marketingEmails.title, exact: true })
          const device = group.getByRole('switch', { name: messages.profile.settingsRows.alertsOnThisDevice, exact: true })
          await expect(email).toBeVisible()
          await expect(device).toBeVisible()
          await expect(email).toHaveAttribute('aria-checked', String(consent))
          const rows = group.locator('.orbit-list-row-shell')
          await expect(rows).toHaveCount(2)
          await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText([
            messages.profile.marketingEmails.title,
            messages.profile.settingsRows.alertsOnThisDevice,
          ])
          await expect(rows.locator('svg')).toHaveCount(0)
          await page.evaluate(() => document.fonts.ready)
          const bounds = await rows.evaluateAll((elements) => elements.map((element) => {
            const row = element.getBoundingClientRect()
            const control = element.querySelector('[role="switch"]')!.getBoundingClientRect()
            const title = element.querySelector('[data-slot="list-row-title"]')!
            return {
              height: row.height,
              top: row.top,
              bottom: row.bottom,
              switchRight: control.right,
              switchInset: row.right - control.right,
              switchHeight: control.height,
              titleClipped: title.scrollWidth > title.clientWidth,
            }
          }))
          const [emailBounds, deviceBounds] = bounds
          expect(emailBounds!.height).toBe(52)
          expect(deviceBounds!.height).toBe(emailBounds!.height)
          expect(deviceBounds!.switchRight).toBe(emailBounds!.switchRight)
          for (const row of bounds) {
            expect(row.switchInset).toBe(24)
            expect(row.switchHeight).toBeGreaterThanOrEqual(44)
            expect(row.titleClipped).toBe(false)
          }
          expect(emailBounds!.bottom).toBeLessThan(deviceBounds!.top)
          const noteTop = await group.getByText(messages.profile.settingsRows.remindersNote, { exact: true })
            .evaluate((element) => element.getBoundingClientRect().top)
          expect(deviceBounds!.bottom).toBeLessThan(noteTop)
        })
      }
    })
  }
}

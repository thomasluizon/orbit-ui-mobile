import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [320, 360, 384, 412, 1352]) {
    test.describe(`Profile account row at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale, layoutProfile: { name: 'Ana', email: 'a@b.co' } })

      test('uses the two-line height, padding and email type', async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale, name: 'Ana', email: 'a@b.co' })
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await page.goto('/profile')
        const row = page.getByTestId('profile-settings-group-you').locator('.orbit-list-row-body').first()
        const shell = page.getByTestId('profile-settings-group-you').locator('.orbit-list-row-shell').first()
        await expect(shell.getByRole('link')).toHaveCount(1)
        await expect(shell.getByRole('link')).toHaveAttribute('href', '/profile/account')
        await expect(shell.getByRole('button')).toHaveCount(0)
        const email = row.locator('[data-slot="list-row-description"]')
        await expect(row.locator('[data-slot="list-row-title"]')).toHaveText(profile.name)
        await expect(email).toHaveText(profile.email)
        await page.evaluate(() => document.fonts.ready)
        const measured = await row.evaluate((body) => {
          const style = getComputedStyle(body)
          const description = body.querySelector('[data-slot="list-row-description"]')!
          const probe = document.createElement('span')
          probe.style.color = 'var(--fg-3)'
          body.append(probe)
          const secondary = getComputedStyle(probe).color
          probe.remove()
          return { height: body.getBoundingClientRect().height, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, paddingStart: style.paddingInlineStart, emailSize: getComputedStyle(description).fontSize, emailColor: getComputedStyle(description).color, secondary }
        })
        expect(Math.abs(measured.height - 68)).toBeLessThanOrEqual(1)
        expect(measured.paddingTop).toBe('12px')
        expect(measured.paddingBottom).toBe('12px')
        expect(measured.paddingStart).toBe('16px')
        expect(measured.emailSize).toBe('14px')
        expect(measured.emailColor).toBe(measured.secondary)
      })

      test('opens Conta from the only control and reveals the full account text', async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale, name: 'Pessoa com um nome completo escrito no próprio perfil', email: `${'longaddress'.repeat(12)}@example.com` })
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        await page.goto('/profile')
        const row = page.getByTestId('profile-settings-group-you').locator('.orbit-list-row-shell').first()
        const link = row.getByRole('link')
        await expect(link).toHaveCount(1)
        await expect(link).toHaveAccessibleName(new RegExp(profile.name))
        await expect(link).toHaveAccessibleName(new RegExp(profile.email))
        await expect(row.getByRole('button')).toHaveCount(0)
        await link.click()
        await expect(page).toHaveURL(/\/profile\/account$/)
        await expect(page.locator('[data-slot="list-row-title"][data-personal-text-expanded]').first()).toHaveText(profile.name)
        await expect(page.locator('[data-slot="list-row-description"][data-personal-text-expanded]').first()).toHaveText(profile.email)
      })
    })
  }
}

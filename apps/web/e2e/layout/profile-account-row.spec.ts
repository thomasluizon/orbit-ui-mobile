import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [320, 412, 1352]) {
    test.describe(`Profile account row at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale, layoutProfile: { name: 'Ana', email: 'a@b.co' } })

      test('uses the two-line height, padding and email type', async ({ page, context }) => {
        const profile = profileSchema.parse({ ...profileFixture, language: locale, name: 'Ana', email: 'a@b.co' })
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
        await page.goto('/profile')
        const row = page.getByTestId('profile-settings-group-you').locator('.orbit-list-row-body').first()
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
    })
  }
}

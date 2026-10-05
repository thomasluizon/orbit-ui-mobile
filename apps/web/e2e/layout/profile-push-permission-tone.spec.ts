import { expect } from '@playwright/test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

for (const width of [412, 1280]) {
  for (const theme of ['dark', 'light'] as const) {
    test.describe(`blocked push permission at ${width}px in ${theme} mode`, () => {
      test.use({
        viewport: { width, height: 915 },
        appLocale: 'pt-BR',
        layoutProfile: { themePreference: theme },
      })

      test('uses the muted status colour', async ({ page }) => {
        await page.addInitScript(() => {
          Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'denied' })
        })
        await page.goto('/profile/notifications')
        const status = page.getByTestId('push-status')
        await expect(status).toHaveText(ptBr.settings.notifications.denied)
        await expect(status).toBeVisible()
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
        await expect(status).toHaveAttribute('role', 'status')
        await expect.poll(() => status.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--fg-3)'
          element.append(probe)
          const muted = getComputedStyle(probe).color
          probe.remove()
          return getComputedStyle(element).color === muted
        })).toBe(true)
      })
    })
  }
}

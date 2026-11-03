import { expect } from '@playwright/test'
import { test } from './layout-test'
import { completeInstallOnboarding } from './install-onboarding'
import { LAYOUT_ORIGIN } from '../support/env'

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`signed-out initial theme with a ${colorScheme} system`, () => {
    test.use({ colorScheme, storageState: { cookies: [], origins: [] } })

    for (const cookieTheme of [null, 'light', 'dark'] as const) {
      test(`keeps ${cookieTheme ?? 'system'} mode before and after hydration`, async ({ page, context }) => {
        if (cookieTheme) {
          await context.addCookies([{ name: 'orbit_theme_mode', value: cookieTheme, url: LAYOUT_ORIGIN }])
        }
        await completeInstallOnboarding(page)
        let releaseScripts = () => {}
        const scriptsReleased = new Promise<void>((resolve) => { releaseScripts = resolve })
        await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
          await scriptsReleased
          await route.continue()
        })
        const mode = cookieTheme ?? colorScheme
        const background = mode === 'light' ? 'rgb(250, 250, 250)' : 'rgb(9, 9, 11)'
        const assertTheme = async () => {
          await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`))
          await expect(page.locator('html')).toHaveCSS('color-scheme', mode)
          await expect(page.locator('body')).toHaveCSS('background-color', background)
          if (!cookieTheme) {
            expect((await context.cookies()).some((cookie) => cookie.name === 'orbit_theme_mode')).toBe(false)
          }
        }
        try {
          await page.goto('/login', { waitUntil: 'commit' })
          await expect(page.locator('main')).toBeVisible()
          await assertTheme()
          releaseScripts()
          await page.waitForLoadState('load')
          await assertTheme()
          if (!cookieTheme) {
            const nextMode = colorScheme === 'light' ? 'dark' : 'light'
            await page.emulateMedia({ colorScheme: nextMode })
            await page.reload()
            await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${nextMode}\\b`))
          }
        } finally {
          releaseScripts()
        }
      })
    }
  })
}

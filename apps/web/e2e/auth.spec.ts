import { test, expect } from '@playwright/test'
import { authenticate } from './support/auth'

test.use({ storageState: { cookies: [], origins: [] } })

test('login through the passwordless OTP UI reaches the app', async ({ page }) => {
  await authenticate(page)

  await expect(page).toHaveURL((url) => !url.pathname.startsWith('/login'))
  await expect(page.locator('[data-bottom-nav]')).toBeVisible()
})

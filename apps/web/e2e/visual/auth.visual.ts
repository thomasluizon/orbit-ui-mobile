import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('login surface', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('#login-email')).toBeVisible()
  await expect(page).toHaveScreenshot('login.png', { fullPage: true })
})

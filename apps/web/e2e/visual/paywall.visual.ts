import { test, expect } from '@playwright/test'
import { FIXED_CLOCK_TIME } from './hermetic-session'

test('paywall surface', async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_CLOCK_TIME))
  await page.goto('/upgrade')
  await expect(page.getByTestId('paywall-checkout')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('paywall.png', { fullPage: true })
})

import { test, expect } from '@playwright/test'
import { FIXED_CLOCK_TIME } from './hermetic-session'

test('today surface', async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_CLOCK_TIME))
  await page.goto('/')
  await expect(page.getByTestId('today-utility-row')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('today.png', { fullPage: true })
})

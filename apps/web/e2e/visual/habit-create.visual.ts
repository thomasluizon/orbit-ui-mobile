import { test, expect } from '@playwright/test'
import { FIXED_CLOCK_TIME } from './hermetic-session'

test('habit-create surface', async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_CLOCK_TIME))
  await page.goto('/')
  await expect(page.getByTestId('today-utility-row')).toBeVisible()

  await page.locator('[data-bottom-nav] [data-tour="tour-fab-button"]').click()

  await expect(page.getByTestId('habit-create-submit')).toBeVisible()
  await expect(page).toHaveScreenshot('habit-create.png', { fullPage: true })
})

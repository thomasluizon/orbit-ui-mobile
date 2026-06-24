import { test, expect } from '@playwright/test'

test('the upgrade paywall renders its checkout CTA', async ({ page }) => {
  await page.goto('/upgrade')

  await expect(page.getByRole('radiogroup')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('paywall-checkout')).toBeVisible({ timeout: 30_000 })
})

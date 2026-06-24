import { test, expect } from '@playwright/test'

test('the upgrade paywall renders its checkout CTA', async ({ page }) => {
  const plansLoaded = page.waitForResponse(
    (response) =>
      response.url().includes('/api/subscriptions/plans') && response.request().method() === 'GET',
    { timeout: 60_000 },
  )

  await page.goto('/upgrade')

  const plansResponse = await plansLoaded
  expect(plansResponse.ok()).toBeTruthy()

  await expect(page.getByRole('radiogroup')).toBeVisible()
  await expect(page.getByTestId('paywall-checkout')).toBeVisible()
})

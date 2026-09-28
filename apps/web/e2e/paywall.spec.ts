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

  const checkout = page.getByRole('button', {
    name: /^(?:Subscribe Annual, recommended|Assinar Anual, recomendado)$/,
  })
  await expect(checkout).toBeVisible()
  await expect(checkout).toBeEnabled()
})

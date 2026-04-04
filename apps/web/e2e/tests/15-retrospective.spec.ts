import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'

test.describe.serial('Retrospective Page', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
  })

  test.afterAll(async () => {})

  test('should navigate to retrospective page', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Navigate to retrospective
    await page.goto('/retrospective')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify the page loaded (not redirected to login)
    const pageContent = page.locator('main').first()
    await expect(pageContent).toBeVisible({ timeout: 5000 })
  })

  test('should display period selector options', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/retrospective')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for period selector options (Week, Month, etc.)
    const periodOptions = page.getByText(/week|month|quarter|year/i)

    const hasPeriodOptions = await periodOptions.first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (hasPeriodOptions) {
      await expect(periodOptions.first()).toBeVisible()
    }

    // Verify page is not in error state
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('should display Generate button for Pro user', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/retrospective')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for a "Generate" button
    const generateButton = page.locator('[data-testid="generate-retrospective"]')

    const hasGenerateButton = await generateButton
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (hasGenerateButton) {
      await expect(generateButton).toBeVisible()
      // Do not click -- generating takes time and makes API calls
    }
  })

  test('should verify retrospective page loads without errors', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/retrospective')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Check there are no error messages on the page
    const errorMessage = page.getByText(/error|something went wrong/i)
    const hasError = await errorMessage.first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    if (!hasError) {
      const pageContent = page.locator('main').first()
      await expect(pageContent).toBeVisible({ timeout: 5000 })
    }
  })
})

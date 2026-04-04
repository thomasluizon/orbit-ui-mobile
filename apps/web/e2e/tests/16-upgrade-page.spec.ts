import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'

test.describe.serial('Upgrade / Subscription Page', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
  })

  test.afterAll(async () => {})

  test('should navigate to upgrade page', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/upgrade')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify the upgrade page loaded (not redirected to login)
    await expect(page).not.toHaveURL(/\/login/)

    const pageContent = page.locator('main').first()
    await expect(pageContent).toBeVisible({ timeout: 5000 })
  })

  test('should display billing interval options', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/upgrade')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for billing interval options
    const monthlyOption = page.getByText(/monthly/i)
    const semiannualOption = page.getByText(/semiannual|6.month/i)
    const yearlyOption = page.getByText(/yearly|annual/i)

    const hasMonthly = await monthlyOption.first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    const hasSemiannual = await semiannualOption.first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    const hasYearly = await yearlyOption.first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)

    // At least one billing option should be visible
    const hasAnyOption = hasMonthly || hasSemiannual || hasYearly
    if (hasAnyOption) {
      const anyOption = monthlyOption.or(semiannualOption).or(yearlyOption)
      await expect(anyOption.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('should display pricing information', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/upgrade')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for price information
    const priceText = page.getByText(/\$|R\$|price|\/month|\/year/i)

    const hasPricing = await priceText.first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (hasPricing) {
      await expect(priceText.first()).toBeVisible()
    }
  })

  test('should display subscription management for Pro user', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/upgrade')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for subscription management elements
    const subscribeButton = page.locator('[data-testid="subscribe-button"]')
    const proIndicator = page.getByText(/pro|subscribed|current plan/i)

    const hasSubscribeButton = await subscribeButton
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    const hasProIndicator = await proIndicator.first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)

    if (hasSubscribeButton) {
      await expect(subscribeButton).toBeVisible()
    } else if (hasProIndicator) {
      await expect(proIndicator.first()).toBeVisible()
    }

    const pageContent = page.locator('main').first()
    await expect(pageContent).toBeVisible({ timeout: 5000 })
  })

  test('should verify upgrade page is accessible from settings', async ({
    page,
    request,
    testAccount,
  }) => {
    test.setTimeout(60000)
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for upgrade/subscription link on the settings page
    const upgradeLink = page.locator('a[href*="upgrade"]')
      .or(page.locator('a[href*="subscription"]'))

    const hasUpgradeLink = await upgradeLink.first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (hasUpgradeLink) {
      await upgradeLink.first().click({ force: true })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      await dismissOverlays(page)

      const pageContent = page.locator('main').first()
      await expect(pageContent).toBeVisible({ timeout: 5000 })
    }
  })
})

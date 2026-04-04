import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'

test.describe.serial('Page Navigation', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
  })

  test.afterAll(async () => {})

  test('should display the bottom navigation bar', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // The bottom nav should be visible
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    await expect(bottomNav).toBeVisible({ timeout: 10000 })

    // Verify nav links exist
    const homeLink = bottomNav.locator('a').filter({ hasText: /habits|home/i }).first()
    const profileLink = bottomNav.locator('a').filter({ hasText: /settings|profile/i }).first()

    await expect(homeLink).toBeVisible({ timeout: 5000 })
    await expect(profileLink).toBeVisible({ timeout: 5000 })
  })

  test('should navigate to Calendar via bottom nav', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find and click the Calendar link in bottom nav
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    const calendarLink = bottomNav.locator('a').filter({ hasText: /calendar/i })
    await expect(calendarLink).toBeVisible({ timeout: 5000 })
    await calendarLink.click()

    // Verify we navigated to /calendar
    await page.waitForURL(/\/calendar/, { timeout: 10000 })

    // Verify calendar content loaded
    const calendarHeading = page.getByText('Calendar').first()
    await expect(calendarHeading).toBeVisible({ timeout: 5000 })
  })

  test('should navigate to Chat via bottom nav', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find and click the Chat link in bottom nav
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    const chatLink = bottomNav.locator('a').filter({ hasText: /chat/i })
    await expect(chatLink).toBeVisible({ timeout: 5000 })
    await chatLink.click()

    // Verify we navigated to /chat
    await page.waitForURL(/\/chat/, { timeout: 10000 })
  })

  test('should navigate to Settings via bottom nav', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find and click the Settings link in bottom nav
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    const settingsLink = bottomNav.locator('a').filter({ hasText: /settings|profile/i })
    await expect(settingsLink).toBeVisible({ timeout: 5000 })
    await settingsLink.click()

    // Verify we navigated to /settings
    await page.waitForURL(/\/settings/, { timeout: 10000 })
  })

  test('should navigate back to Home via bottom nav', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // First navigate away from home
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click the Home link in bottom nav
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    const homeLink = bottomNav.locator('a').first()
    await expect(homeLink).toBeVisible({ timeout: 5000 })
    await homeLink.click()

    // Verify we navigated back to /
    await page.waitForURL('/', { timeout: 10000 })
  })

  test('should handle direct URL navigation', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const routes = [
      { path: '/', text: /orbit|habits|today/i },
      { path: '/calendar', text: /calendar/i },
      { path: '/chat', text: /chat/i },
      { path: '/settings', text: /settings|profile/i },
    ]

    for (const route of routes) {
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      await dismissOverlays(page)

      // Verify the page loaded (not redirected to login)
      const content = page.getByText(route.text).first()
      await expect(content).toBeVisible({ timeout: 10000 })
    }
  })

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Clear any existing cookies
    await page.context().clearCookies()
    await page.goto('/')

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 })

    // Verify login page is shown
    const emailInput = page.locator('[data-testid="email-input"]')
    await expect(emailInput).toBeVisible({ timeout: 10000 })
  })
})

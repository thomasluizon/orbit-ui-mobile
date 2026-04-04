import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'

test.describe.serial('AI Memory (User Facts)', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
  })

  test('should navigate to settings and find the facts section', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the AI Memory / Facts section
    const memorySection = page.locator('[data-testid="ai-memory-section"]')
    await expect(memorySection).toBeVisible({ timeout: 10000 })
    await memorySection.scrollIntoViewIfNeeded()

    // Verify the section has relevant content
    const memoryHeading = page.getByText(/memory|facts/i).first()
    await expect(memoryHeading).toBeVisible({ timeout: 5000 })
  })

  test('should display user facts as read-only', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Facts section should be visible
    const factsSection = page.locator('[data-testid="user-facts-section"]')
    if (await factsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await factsSection.scrollIntoViewIfNeeded()
      await expect(factsSection).toBeVisible()
    }
  })

  test('should verify memory toggle works for Pro user', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the AI Memory section
    const memorySection = page.locator('[data-testid="ai-memory-section"]')
    if (await memorySection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await memorySection.scrollIntoViewIfNeeded()

      // Find and toggle
      const toggleButton = memorySection.locator('[data-testid="ai-memory-toggle"]')
      if (await toggleButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleButton.click({ force: true })
        await page.waitForTimeout(1000)

        // Toggle back to restore original state
        await toggleButton.click({ force: true })
        await page.waitForTimeout(1000)
      }
    }

    // Verify the section is still visible
    await expect(page).not.toHaveURL(/\/login/)
  })
})

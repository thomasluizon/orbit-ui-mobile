import { test, expect } from '../fixtures'
import { API_URL, authenticatePage, dismissOverlays } from '../helpers/auth'

test.describe.serial('Authentication Flow', () => {
  test('should display the login page', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Verify email input is visible
    const emailInput = page.locator('[data-testid="email-input"]')
    await expect(emailInput).toBeVisible({ timeout: 10000 })

    // Verify submit button is visible
    const submitButton = page.locator('[data-testid="send-code-button"]')
    await expect(submitButton).toBeVisible()
  })

  test('should enter email and navigate to code step', async ({ page, request, testAccount }) => {
    // Prime the cache so send-code succeeds without rate limit
    await request.post(`${API_URL}/api/auth/send-code`, {
      data: { email: testAccount.email, language: 'en' },
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const emailInput = page.locator('[data-testid="email-input"]')
    await emailInput.click()
    await emailInput.fill(testAccount.email)
    await emailInput.press('Enter')

    // Wait for code input step
    const codeInput = page.locator('[data-testid="code-input-0"]')
    await expect(codeInput).toBeVisible({ timeout: 15000 })

    await expect(page.getByText(testAccount.email)).toBeVisible()
  })

  test('should enter verification code and redirect to home', async ({ page, request, testAccount }) => {
    await request.post(`${API_URL}/api/auth/send-code`, {
      data: { email: testAccount.email, language: 'en' },
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Enter email
    await page.locator('[data-testid="email-input"]').fill(testAccount.email)
    await page.locator('[data-testid="send-code-button"]').click()

    // Wait for code step
    await page.locator('[data-testid="code-input-0"]').waitFor({ timeout: 15000 })

    // Enter the 6-digit code
    const codeDigits = testAccount.code.split('')
    for (let i = 0; i < codeDigits.length; i++) {
      await page.locator(`[data-testid="code-input-${i}"]`).fill(codeDigits[i])
    }

    // Submit verification
    await page.locator('[data-testid="verify-code-button"]').click()

    // Wait for redirect to home
    await page.waitForURL('/', { timeout: 15000 })
  })

  test('should show authenticated state after login', async ({ page, request, testAccount }) => {
    await request.post(`${API_URL}/api/auth/send-code`, {
      data: { email: testAccount.email, language: 'en' },
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    await page.locator('[data-testid="email-input"]').fill(testAccount.email)
    await page.locator('[data-testid="send-code-button"]').click()
    await page.locator('[data-testid="code-input-0"]').waitFor({ timeout: 15000 })

    const codeDigits = testAccount.code.split('')
    for (let i = 0; i < codeDigits.length; i++) {
      await page.locator(`[data-testid="code-input-${i}"]`).fill(codeDigits[i])
    }
    await page.locator('[data-testid="verify-code-button"]').click()
    await page.waitForURL('/', { timeout: 15000 })

    // Navigate to profile to verify authenticated state
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const profileContent = page.getByText(/settings|profile/i).first()
    await expect(profileContent).toBeVisible({ timeout: 10000 })
  })

  test('should logout successfully', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)

    await page.goto('/settings')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click the logout button
    const logoutButton = page.locator('[data-testid="logout-button"]')
    await logoutButton.scrollIntoViewIfNeeded()
    await expect(logoutButton).toBeVisible({ timeout: 10000 })
    await logoutButton.click()

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 15000 })
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible({ timeout: 10000 })
  })
})

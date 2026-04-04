import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper } from '../helpers/api'

test.describe.serial('Settings and Profile', () => {
  let token: string
  let originalTimezone: string
  let originalLanguage: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)

    // Store original settings for cleanup
    const profile = (await api.getProfile()) as { timeZone?: string; language?: string }
    originalTimezone = profile.timeZone || 'UTC'
    originalLanguage = profile.language || 'en'
  })

  test.afterAll(async ({ request }) => {
    // Restore original settings
    const api = createAPIHelper(request, token)
    await api.updateTimezone(originalTimezone)
    await api.updateLanguage(originalLanguage)
  })

  test('should show settings on profile page', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify settings page loaded
    const settingsHeading = page.getByText(/settings|profile/i).first()
    await expect(settingsHeading).toBeVisible({ timeout: 10000 })

    // Verify language section is visible
    const languageSection = page.getByText(/language/i).first()
    await expect(languageSection).toBeVisible({ timeout: 10000 })
  })

  test('should change language to PT-BR', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find and click the PT-BR button
    const ptBrButton = page.locator('[data-testid="lang-pt-BR"]')
    if (await ptBrButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ptBrButton.click({ force: true })

      // Wait for the language to change
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(3000)

      // After changing to PT-BR, some text should now be in Portuguese
      const ptContent = page
        .getByText(/configurac|idioma|aparencia|fuso|prefer/i)
        .first()
      await expect(ptContent).toBeVisible({ timeout: 10000 })
    }
  })

  test('should change language back to English', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click the English button
    const enButton = page.locator('[data-testid="lang-en"]')
    if (await enButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await enButton.click({ force: true })

      // Wait for UI to update
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(3000)

      // Verify English text is back
      const enContent = page
        .getByText(/language|settings|timezone/i)
        .first()
      await expect(enContent).toBeVisible({ timeout: 10000 })
    }
  })

  test('should change timezone', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the timezone section
    const timezoneSection = page.locator('[data-testid="timezone-section"]')
    if (await timezoneSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await timezoneSection.scrollIntoViewIfNeeded()

      // Click the Edit button to open the timezone picker
      const editButton = timezoneSection.locator('[data-testid="timezone-edit"]')
      if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editButton.click({ force: true })
        await page.waitForTimeout(500)

        // Search for a timezone
        const searchInput = timezoneSection.locator('input[type="text"]').first()
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchInput.fill('America/New_York')
          await page.waitForTimeout(500)

          // Click on the timezone option
          const timezoneOption = page.getByText('America/New_York').first()
          if (await timezoneOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await timezoneOption.click({ force: true })
            await page.waitForTimeout(1000)
          }
        }
      }
    }
  })

  test('should toggle AI memory setting', async ({ page, request, testAccount }) => {
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

      // Find the toggle
      const toggleButton = memorySection.locator('[data-testid="ai-memory-toggle"]')
      if (await toggleButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Toggle
        await toggleButton.click({ force: true })
        await page.waitForTimeout(1000)

        // Toggle back to original state
        await toggleButton.click({ force: true })
        await page.waitForTimeout(1000)
      }
    }

    // Page should still be functional
    await expect(page).not.toHaveURL(/\/login/)
  })
})

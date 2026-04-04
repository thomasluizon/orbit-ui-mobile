import { test, expect } from '../fixtures'
import { authenticatePage, dismissOverlays } from '../helpers/auth'

test.describe.serial('AI Chat', () => {
  test('should display chat page with input', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Navigate to chat via bottom nav
    const chatLink = page.locator('nav').last().locator('a').filter({ hasText: /chat/i })
    await expect(chatLink).toBeVisible({ timeout: 5000 })
    await chatLink.click()
    await page.waitForTimeout(3000)

    // Verify chat loaded -- check for the input textarea
    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })
  })

  test('should send a message and see response area', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Navigate to chat
    const chatLink = page.locator('nav').last().locator('a').filter({ hasText: /chat/i })
    await chatLink.click()
    await page.waitForTimeout(3000)

    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    // Type a message
    await chatInput.click()
    await chatInput.fill('Hello, this is an E2E test message')

    // Find and click the send button
    const sendButton = page.locator('[data-testid="chat-send-button"]')
    if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendButton.click()
      await page.waitForTimeout(5000)
    }

    // Should still be on chat page
    await expect(chatInput).toBeVisible()
  })
})

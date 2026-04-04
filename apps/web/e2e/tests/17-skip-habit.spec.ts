import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Skip Habit', () => {
  let token: string
  const RECURRING_HABIT = 'E2E Skip Recurring'
  const ONETIME_HABIT = 'E2E Skip OneTime'

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E Skip'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E Skip'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test('should show Skip option in menu for recurring habit due today', async ({ page, request, testAccount }) => {
    // Create a recurring daily habit due today via API
    const today = new Date().toISOString().split('T')[0]
    const api = createAPIHelper(request, token)
    await api.createHabit({
      title: RECURRING_HABIT,
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })

    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the habit card and open menu
    const habitText = page.getByText(RECURRING_HABIT)
    await expect(habitText).toBeVisible({ timeout: 10000 })

    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const menuButton = habitCard.locator('[data-testid="habit-menu-button"]')
    await menuButton.click({ force: true })
    await page.waitForTimeout(500)

    // Verify Skip button is visible in the menu
    const skipButton = page.locator('[data-testid="menu-skip"]')
    await expect(skipButton).toBeVisible({ timeout: 3000 })
  })

  test('should show confirmation dialog when clicking Skip', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open menu on the recurring habit
    const habitText = page.getByText(RECURRING_HABIT)
    await expect(habitText).toBeVisible({ timeout: 10000 })

    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const menuButton = habitCard.locator('[data-testid="habit-menu-button"]')
    await menuButton.click({ force: true })
    await page.waitForTimeout(500)

    // Click Skip
    const skipButton = page.locator('[data-testid="menu-skip"]')
    await skipButton.click()
    await page.waitForTimeout(500)

    // Verify confirmation dialog appears
    await expect(page.getByText('Skip Habit')).toBeVisible({ timeout: 3000 })

    // Cancel to avoid skipping yet
    const cancelButton = page.getByText('Cancel', { exact: true })
    await cancelButton.click()
    await page.waitForTimeout(500)
  })

  test('should skip the habit and advance due date', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify habit is visible before skip
    const habitText = page.getByText(RECURRING_HABIT)
    await expect(habitText).toBeVisible({ timeout: 10000 })

    // Open menu
    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const menuButton = habitCard.locator('[data-testid="habit-menu-button"]')
    await menuButton.click({ force: true })
    await page.waitForTimeout(500)

    // Click Skip
    const skipButton = page.locator('[data-testid="menu-skip"]')
    await skipButton.click()
    await page.waitForTimeout(500)

    // Confirm skip
    const confirmButton = page.locator('[data-testid="confirm-skip-button"]')
    await confirmButton.click()
    await page.waitForTimeout(2000)

    // Habit should no longer be due today
    await expect(page.getByText(RECURRING_HABIT)).not.toBeVisible({ timeout: 10000 })
  })

  test('should NOT show Skip option for one-time habit', async ({ page, request, testAccount }) => {
    // Create a one-time habit due today
    const today = new Date().toISOString().split('T')[0]
    const api = createAPIHelper(request, token)
    await api.createHabit({
      title: ONETIME_HABIT,
      dueDate: today,
    })

    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the one-time habit and open menu
    const habitText = page.getByText(ONETIME_HABIT)
    await expect(habitText).toBeVisible({ timeout: 10000 })

    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const menuButton = habitCard.locator('[data-testid="habit-menu-button"]')
    await menuButton.click({ force: true })
    await page.waitForTimeout(500)

    // Verify Skip button is NOT in the menu
    const skipButton = page.locator('[data-testid="menu-skip"]')
    await expect(skipButton).not.toBeVisible({ timeout: 2000 })

    // Close menu
    await page.keyboard.press('Escape')
  })

  test('should NOT show Skip option for already completed habit', async ({ page, request, testAccount }) => {
    // Log the one-time habit to mark it completed
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const oneTime = habits.find((h) => h.title === ONETIME_HABIT)
    if (oneTime) {
      await api.logHabit(oneTime.id)
    }

    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // The completed habit might still be visible
    const habitText = page.getByText(ONETIME_HABIT)
    if (await habitText.isVisible({ timeout: 3000 }).catch(() => false)) {
      const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
      const menuButton = habitCard.locator('[data-testid="habit-menu-button"]')
      await menuButton.click({ force: true })
      await page.waitForTimeout(500)

      // Skip should not be in menu for completed habits
      const skipButton = page.locator('[data-testid="menu-skip"]')
      await expect(skipButton).not.toBeVisible({ timeout: 2000 })
    }
  })
})

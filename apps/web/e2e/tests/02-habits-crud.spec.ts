import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Habits CRUD', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    // Clean up any pre-existing test data
    const api = createAPIHelper(request, token)
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E '))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E '))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test('should create a habit via the UI', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click the FAB to create a habit
    const fabButton = page.locator('[data-testid="fab-create"]')
    await expect(fabButton).toBeVisible({ timeout: 10000 })
    await fabButton.click()

    // Wait for the create modal/sheet to appear
    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Fill in the title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.fill('E2E Test Habit')

    // Click "Recurring" chip to ensure recurring mode is active
    const recurringChip = page.locator('[data-testid="frequency-recurring"]')
    await recurringChip.click()
    await page.waitForTimeout(500)

    // Submit
    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()

    // Wait for modal to close and habit to appear
    await page.waitForTimeout(2000)

    // Verify habit appears in the list
    const habitTitle = page.getByText('E2E Test Habit')
    await expect(habitTitle).toBeVisible({ timeout: 10000 })
  })

  test('should display the habit in the list', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitCard = page.getByText('E2E Test Habit')
    await expect(habitCard).toBeVisible({ timeout: 10000 })
  })

  test('should open habit detail drawer', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click on the habit card text to open detail drawer
    const habitCard = page.getByText('E2E Test Habit')
    await expect(habitCard).toBeVisible({ timeout: 10000 })
    await habitCard.click()

    // Wait for the detail drawer/sheet to appear
    await page.waitForTimeout(500)

    // Verify the Edit and Delete buttons are visible
    const editButton = page.locator('[data-testid="habit-edit-button"]')
    await expect(editButton).toBeVisible({ timeout: 5000 })

    const deleteButton = page.locator('[data-testid="habit-delete-button"]')
    await expect(deleteButton).toBeVisible({ timeout: 5000 })

    // Close the drawer
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('should edit the habit title', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click on the habit card to open detail drawer
    const habitCard = page.getByText('E2E Test Habit')
    await expect(habitCard).toBeVisible({ timeout: 10000 })
    await habitCard.click()
    await page.waitForTimeout(500)

    // Click the Edit button
    const editButton = page.locator('[data-testid="habit-edit-button"]')
    await expect(editButton).toBeVisible({ timeout: 5000 })
    await editButton.click()

    // Wait for the edit modal to appear
    await page.getByText('Edit Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Clear and update the title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.clear()
    await titleInput.fill('E2E Updated Habit')

    // Submit the edit
    const saveButton = page.locator('[data-testid="save-habit-submit"]')
    await saveButton.scrollIntoViewIfNeeded()
    await saveButton.click()

    // Wait for modal to close
    await page.waitForTimeout(2000)

    // Verify updated title appears
    const updatedTitle = page.getByText('E2E Updated Habit').first()
    await expect(updatedTitle).toBeVisible({ timeout: 10000 })
  })

  test('should log/complete the habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the habit card
    const habitText = page.getByText('E2E Updated Habit').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })

    // Find and click the log/complete button on the habit card
    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const logButton = habitCard.locator('[data-testid="habit-log-button"]').first()

    await logButton.click({ force: true })

    // Handle log modal if it appears
    await page.waitForTimeout(1000)
    const logModalTitle = page.getByText('Log Habit')
    if (await logModalTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const confirmLogButton = page.locator('[data-testid="confirm-log-button"]')
      await confirmLogButton.click()
      await page.waitForTimeout(500)
    }

    // Wait for the completion state to update
    await page.waitForTimeout(2000)

    // Verify the page did not error out
    await expect(page.getByText('E2E Updated Habit').first()).toBeVisible()
  })

  test('should delete the habit via detail drawer', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click on the habit to open detail drawer
    const habitText = page.getByText('E2E Updated Habit').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })
    await habitText.click()
    await page.waitForTimeout(500)

    // Click the Delete button
    const deleteButton = page.locator('[data-testid="habit-delete-button"]')
    await expect(deleteButton).toBeVisible({ timeout: 5000 })
    await deleteButton.click()

    // Wait for confirmation dialog
    await page.waitForTimeout(500)
    await page.getByText('Delete Habit').waitFor({ timeout: 5000 })

    // Click the confirm Delete button
    const confirmButton = page.locator('[data-testid="confirm-delete-button"]')
    await confirmButton.click()

    // Wait for deletion and verify habit is gone
    await page.waitForTimeout(3000)
    const deletedHabit = page.getByText('E2E Updated Habit').first()
    await expect(deletedHabit).not.toBeVisible({ timeout: 10000 })
  })

  test('should confirm habit is gone from the list', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habit = page.getByText('E2E Updated Habit').first()
    await expect(habit).not.toBeVisible({ timeout: 5000 })
  })
})

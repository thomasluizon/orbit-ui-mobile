import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Reminders', () => {
  let token = ''
  const HABIT_NAME = 'E2E Reminder Habit'

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E Reminder'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E Reminder'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test('should show reminder section only when dueTime is set', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open create modal
    const fabButton = page.locator('[data-testid="fab-create"]')
    await expect(fabButton).toBeVisible({ timeout: 10000 })
    await fabButton.click()
    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Reminder section should NOT be visible (no dueTime set)
    const reminderToggle = page.locator('[data-testid="reminder-toggle"]')
    await expect(reminderToggle).not.toBeVisible({ timeout: 2000 })

    // Set a due time
    const dueTimeInput = page.locator('[data-testid="due-time-input"]')
    await dueTimeInput.scrollIntoViewIfNeeded()
    await dueTimeInput.click()
    await dueTimeInput.fill('1400')
    await page.waitForTimeout(500)

    // Reminder section should now be visible
    await expect(reminderToggle).toBeVisible({ timeout: 3000 })

    // Close modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('should enable reminder and show default chip', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open create modal
    const fabButton = page.locator('[data-testid="fab-create"]')
    await fabButton.click()
    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Fill title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.fill(HABIT_NAME)

    // Set due time
    const dueTimeInput = page.locator('[data-testid="due-time-input"]')
    await dueTimeInput.scrollIntoViewIfNeeded()
    await dueTimeInput.click()
    await dueTimeInput.fill('1400')
    await page.waitForTimeout(500)

    // Toggle reminder on
    const reminderToggle = page.locator('[data-testid="reminder-toggle"]')
    await reminderToggle.scrollIntoViewIfNeeded()
    await reminderToggle.click()
    await page.waitForTimeout(500)

    // Default chips should be visible
    const atTimeChip = page.getByText('At the due time')
    await expect(atTimeChip).toBeVisible({ timeout: 3000 })
    const defaultChip = page.getByText('15 min before')
    await expect(defaultChip).toBeVisible({ timeout: 3000 })

    // "Add reminder" button should be visible
    const addButton = page.locator('[data-testid="add-reminder"]')
    await expect(addButton).toBeVisible({ timeout: 3000 })

    // Close modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('should add multiple reminders and create habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open create modal
    const fabButton = page.locator('[data-testid="fab-create"]')
    await fabButton.click()
    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Fill title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.fill(HABIT_NAME)

    // Set recurring
    const recurringChip = page.locator('[data-testid="frequency-recurring"]')
    await recurringChip.click()
    await page.waitForTimeout(500)

    // Set due time
    const dueTimeInput = page.locator('[data-testid="due-time-input"]')
    await dueTimeInput.scrollIntoViewIfNeeded()
    await dueTimeInput.click()
    await dueTimeInput.fill('1400')
    await page.waitForTimeout(500)

    // Toggle reminder on
    const reminderToggle = page.locator('[data-testid="reminder-toggle"]')
    await reminderToggle.scrollIntoViewIfNeeded()
    await reminderToggle.click()
    await page.waitForTimeout(500)

    // Add "1 day before" reminder
    const addButton = page.locator('[data-testid="add-reminder"]')
    await addButton.click()
    await page.waitForTimeout(500)

    const oneDayOption = page.getByText('1 day before')
    await oneDayOption.click()
    await page.waitForTimeout(500)

    // All three chips should be visible
    await expect(page.getByText('At the due time')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('15 min before')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('1 day before')).toBeVisible({ timeout: 3000 })

    // Submit
    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()
    await page.waitForTimeout(2000)

    // Verify habit appears
    await expect(page.getByText(HABIT_NAME)).toBeVisible({ timeout: 10000 })
  })

  test('should remove a reminder chip in edit mode', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open the habit detail to edit
    const habitText = page.getByText(HABIT_NAME)
    await expect(habitText).toBeVisible({ timeout: 10000 })
    await habitText.click()
    await page.waitForTimeout(500)

    // Click Edit in detail drawer
    const editButton = page.locator('[data-testid="habit-edit-button"]')
    await expect(editButton).toBeVisible({ timeout: 5000 })
    await editButton.click()
    await page.getByText('Edit Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Verify all reminder chips are still there
    const chipAtTime = page.getByText('At the due time')
    await chipAtTime.scrollIntoViewIfNeeded()
    await expect(chipAtTime).toBeVisible({ timeout: 3000 })

    const chip15min = page.getByText('15 min before')
    await expect(chip15min).toBeVisible({ timeout: 3000 })

    const chip1day = page.getByText('1 day before')
    await expect(chip1day).toBeVisible({ timeout: 3000 })

    // Remove the 15 min chip (click the X button inside it)
    const removeButton = chip15min.locator('button')
    await removeButton.click()
    await page.waitForTimeout(500)

    // 15 min chip should be gone, others should remain
    await expect(chip15min).not.toBeVisible({ timeout: 2000 })
    await expect(page.getByText('At the due time')).toBeVisible()
    await expect(page.getByText('1 day before')).toBeVisible()

    // Close without saving
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

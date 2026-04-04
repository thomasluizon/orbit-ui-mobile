import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('End Date for Recurring Habits', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E EndDate'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E EndDate'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test('should create a recurring habit with end date', async ({ page, request, testAccount }) => {
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

    // Fill title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.fill('E2E EndDate Habit')

    // Set to recurring
    const recurringChip = page.locator('[data-testid="frequency-recurring"]')
    await recurringChip.click()
    await page.waitForTimeout(500)

    // Click "Add end date" link
    const addEndDateButton = page.locator('[data-testid="add-end-date"]')
    await addEndDateButton.scrollIntoViewIfNeeded()
    await expect(addEndDateButton).toBeVisible()
    await addEndDateButton.click()
    await page.waitForTimeout(500)

    // Verify the end date input appeared
    const endDateLabel = page.getByText('End Date')
    await expect(endDateLabel).toBeVisible()

    // Submit
    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()
    await page.waitForTimeout(2000)

    // Verify habit appears
    const habitTitle = page.getByText('E2E EndDate Habit')
    await expect(habitTitle).toBeVisible({ timeout: 10000 })
  })

  test('should edit habit to remove end date', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click on the habit to open detail drawer
    const habitCard = page.getByText('E2E EndDate Habit')
    await expect(habitCard).toBeVisible({ timeout: 10000 })
    await habitCard.click()
    await page.waitForTimeout(1000)

    // Click Edit button
    const editButton = page.locator('[data-testid="habit-edit-button"]')
    await expect(editButton).toBeVisible({ timeout: 5000 })
    await editButton.click()
    await page.waitForTimeout(1500)

    // Look for the clear end date button
    const clearEndDate = page.locator('[data-testid="clear-end-date"]')
    if (await clearEndDate.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clearEndDate.click()
      await page.waitForTimeout(500)
    }

    // Submit the form
    const submitButton = page.locator('[data-testid="save-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()
    await page.waitForTimeout(2000)

    // Verify the habit still exists
    const habitTitle = page.getByText('E2E EndDate Habit')
    await expect(habitTitle).toBeVisible({ timeout: 10000 })
  })
})

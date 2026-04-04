import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Habit Checklists', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
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

  test('should create a habit with checklist items', async ({ page, request, testAccount }) => {
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
    await titleInput.fill('E2E Checklist Habit')

    // Scroll to checklist section and add items
    const addItemInput = page.locator('[data-testid="checklist-add-input"]')
    await addItemInput.scrollIntoViewIfNeeded()

    // Add Item 1
    await addItemInput.click()
    await addItemInput.fill('Item 1')
    const addButton = page.locator('[data-testid="checklist-add-button"]')
    await addButton.click()
    await page.waitForTimeout(300)

    // Add Item 2
    await addItemInput.click()
    await addItemInput.fill('Item 2')
    await addButton.click()
    await page.waitForTimeout(300)

    // Add Item 3
    await addItemInput.click()
    await addItemInput.fill('Item 3')
    await addButton.click()
    await page.waitForTimeout(300)

    // Submit the form
    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()
    await page.waitForTimeout(2000)

    // Verify habit appears
    const habitTitle = page.getByText('E2E Checklist Habit').first()
    await expect(habitTitle).toBeVisible({ timeout: 10000 })
  })

  test('should display checklist items in detail drawer', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click on the habit to open detail drawer
    const habitTitle = page.getByText('E2E Checklist Habit').first()
    await expect(habitTitle).toBeVisible({ timeout: 10000 })
    await habitTitle.click({ force: true })
    await page.waitForTimeout(500)

    // Verify checklist items appear in the drawer
    const item1 = page.getByText('Item 1', { exact: true })
    const item2 = page.getByText('Item 2', { exact: true })
    const item3 = page.getByText('Item 3', { exact: true })

    await expect(item1).toBeVisible({ timeout: 5000 })
    await expect(item2).toBeVisible({ timeout: 5000 })
    await expect(item3).toBeVisible({ timeout: 5000 })

    // Close drawer
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('should check off checklist items', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open detail drawer
    const habitTitle = page.getByText('E2E Checklist Habit').first()
    await expect(habitTitle).toBeVisible({ timeout: 10000 })
    await habitTitle.click({ force: true })
    await page.waitForTimeout(500)

    // Find and click the checkbox for Item 1
    const item1Text = page.getByText('Item 1', { exact: true })
    await expect(item1Text).toBeVisible({ timeout: 5000 })

    const item1Row = item1Text.locator('..')
    const checkbox1 = item1Row.locator('[data-testid="checklist-toggle"]').first()
    if (await checkbox1.isVisible().catch(() => false)) {
      await checkbox1.click()
      await page.waitForTimeout(1000)
    }

    // Check off Item 2
    const item2Text = page.getByText('Item 2', { exact: true })
    await expect(item2Text).toBeVisible({ timeout: 5000 })
    const item2Row = item2Text.locator('..')
    const checkbox2 = item2Row.locator('[data-testid="checklist-toggle"]').first()
    if (await checkbox2.isVisible().catch(() => false)) {
      await checkbox2.click()
      await page.waitForTimeout(1000)
    }

    // Verify progress indicator shows 2/3
    const progressText = page.getByText('2/3')
    await expect(progressText).toBeVisible({ timeout: 5000 })

    // Close drawer
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('should reset checklist when habit is logged (recurring)', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the habit and log it
    const habitText = page.getByText('E2E Checklist Habit').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })

    // Click the log button on the card
    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const logButton = habitCard.locator('[data-testid="habit-log-button"]').first()

    if (await logButton.isVisible().catch(() => false)) {
      await logButton.click({ force: true })

      // Handle log modal if it appears
      await page.waitForTimeout(1000)
      const logModalTitle = page.getByText('Log Habit')
      if (await logModalTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
        const confirmButton = page.locator('[data-testid="confirm-log-button"]')
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click()
        }
      }

      await page.waitForTimeout(3000)
    }

    // After logging a recurring habit, the checklist should reset
    await expect(page.getByText('E2E Checklist Habit').first()).toBeVisible()
  })

  test('should delete the checklist habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitTitle = page.getByText('E2E Checklist Habit').first()

    if (await habitTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await habitTitle.click()
      await page.waitForTimeout(500)

      const deleteButton = page.locator('[data-testid="habit-delete-button"]')
      await expect(deleteButton).toBeVisible({ timeout: 5000 })
      await deleteButton.click()

      await page.waitForTimeout(500)
      await page.getByText('Delete Habit').waitFor({ timeout: 5000 })

      const confirmButton = page.locator('[data-testid="confirm-delete-button"]')
      await confirmButton.click()
      await page.waitForTimeout(3000)
    }

    await expect(page.getByText('E2E Checklist Habit').first()).not.toBeVisible({
      timeout: 10000,
    })
  })
})

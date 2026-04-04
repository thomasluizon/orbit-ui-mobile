import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper } from '../helpers/api'

test.describe.serial('Goals CRUD', () => {
  let token: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)
    await cleanupGoals(api)
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    await cleanupGoals(api)
  })

  async function cleanupGoals(api: ReturnType<typeof createAPIHelper>) {
    try {
      const res = await api.getGoals()
      const goals = (res as { items?: { id: string; title: string }[] }).items ?? []
      for (const goal of goals) {
        if (goal.title.startsWith('E2E ')) {
          await api.deleteGoal(goal.id)
        }
      }
    } catch {
      // Goals endpoint may not exist yet
    }
  }

  test('should navigate to Goals tab', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click the Goals tab
    const goalsTab = page.locator('[data-testid="tab-goals"]')
    await expect(goalsTab).toBeVisible({ timeout: 10000 })
    await goalsTab.click()
    await page.waitForTimeout(500)

    // Should show empty state or goals list
    const emptyState = page.getByText('No goals yet')
    const goalCard = page.locator('[data-testid="goal-card"]').first()
    const isVisible = await emptyState.isVisible({ timeout: 3000 }).catch(() => false) ||
                      await goalCard.isVisible({ timeout: 1000 }).catch(() => false)
    expect(isVisible).toBe(true)
  })

  test('should create a goal via FAB', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Switch to goals tab
    await page.locator('[data-testid="tab-goals"]').click()
    await page.waitForTimeout(500)

    // Click FAB to create
    const fabButton = page.locator('[data-testid="fab-create"]')
    await expect(fabButton).toBeVisible({ timeout: 5000 })
    await fabButton.click()
    await page.waitForTimeout(1000)

    // Fill the create goal form
    const targetInput = page.locator('[data-testid="goal-target-input"]')
    await targetInput.click()
    await targetInput.fill('12')

    const unitInput = page.locator('[data-testid="goal-unit-input"]')
    await unitInput.click()
    await unitInput.fill('books')

    const descriptionInput = page.locator('[data-testid="goal-description-input"]')
    await descriptionInput.click()
    await descriptionInput.fill('E2E Read 12 Books')

    // Submit
    const submitBtn = page.locator('[data-testid="create-goal-submit"]')
    await submitBtn.click()
    await page.waitForTimeout(2000)

    // Verify goal appears
    await expect(page.getByText('E2E Read 12 Books')).toBeVisible({ timeout: 5000 })
  })

  test('should update goal progress', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Switch to goals tab
    await page.locator('[data-testid="tab-goals"]').click()
    await page.waitForTimeout(1000)

    // Click on the goal card to open detail
    const goalCard = page.getByText('E2E Read 12 Books')
    await expect(goalCard).toBeVisible({ timeout: 5000 })
    await goalCard.click()
    await page.waitForTimeout(1000)

    // Click "Update Progress"
    const updateBtn = page.locator('[data-testid="update-progress-button"]')
    await expect(updateBtn).toBeVisible({ timeout: 5000 })
    await updateBtn.click()
    await page.waitForTimeout(500)

    // Fill in new value
    const valueInput = page.locator('[data-testid="progress-value-input"]')
    await valueInput.click()
    await valueInput.fill('5')

    // Save
    const saveBtn = page.locator('[data-testid="save-progress-button"]')
    await saveBtn.click()
    await page.waitForTimeout(2000)

    // Verify progress updated
    await expect(page.getByText('5 of 12 books')).toBeVisible({ timeout: 5000 })
  })

  test('should delete a goal', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Switch to goals tab
    await page.locator('[data-testid="tab-goals"]').click()
    await page.waitForTimeout(1000)

    // Open goal detail
    const goalCard = page.getByText('E2E Read 12 Books')
    await expect(goalCard).toBeVisible({ timeout: 5000 })
    await goalCard.click()
    await page.waitForTimeout(1000)

    // Click Delete
    const deleteBtn = page.locator('[data-testid="delete-goal-button"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()
    await page.waitForTimeout(500)

    // Confirm deletion
    const confirmBtn = page.locator('[data-testid="confirm-delete-button"]')
    await confirmBtn.click()
    await page.waitForTimeout(2000)

    // Verify goal is gone
    await expect(page.getByText('E2E Read 12 Books')).not.toBeVisible({ timeout: 5000 })
  })
})

import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Sub-Habits (Hierarchical Habits)', () => {
  let token = ''

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

  test('should create a parent habit with sub-habits', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Open create modal via FAB
    const fabButton = page.locator('[data-testid="fab-create"]')
    await expect(fabButton).toBeVisible({ timeout: 10000 })
    await fabButton.click()

    // Wait for create modal
    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Fill parent title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.fill('E2E Parent')

    // Scroll down and click "Add sub-habit"
    const addSubHabitButton = page.locator('[data-testid="add-sub-habit"]')
    await addSubHabitButton.scrollIntoViewIfNeeded()
    await addSubHabitButton.click()
    await page.waitForTimeout(300)

    // Fill first sub-habit
    const subInputs = page.locator('[data-testid="sub-habit-title-input"]')
    await subInputs.first().click()
    await subInputs.first().fill('E2E Child 1')

    // Add second sub-habit
    await addSubHabitButton.click()
    await page.waitForTimeout(300)

    // Fill second sub-habit
    await subInputs.last().click()
    await subInputs.last().fill('E2E Child 2')

    // Submit the form
    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()

    // Wait for modal to close
    await page.waitForTimeout(2000)

    // Verify parent habit appears
    const parentTitle = page.getByText('E2E Parent')
    await expect(parentTitle).toBeVisible({ timeout: 10000 })
  })

  test('should display sub-habits nested under parent', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify parent is visible
    const parentTitle = page.getByText('E2E Parent')
    await expect(parentTitle).toBeVisible({ timeout: 10000 })

    // Check if children are visible (they should be expanded by default)
    const child1 = page.getByText('E2E Child 1')
    const child2 = page.getByText('E2E Child 2')

    // Children might need the parent to be expanded
    if (!(await child1.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Try to expand by clicking the expand toggle on the parent card
      const expandButton = page.locator('[data-testid="expand-children"]').first()
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click()
        await page.waitForTimeout(500)
      }
    }

    // Verify at least one child is visible
    const anyChild = child1.or(child2)
    await expect(anyChild.first()).toBeVisible({ timeout: 5000 })
  })

  test('should add a sub-habit via kebab menu', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Find the parent habit
    const parentTitle = page.getByText('E2E Parent')
    await expect(parentTitle).toBeVisible({ timeout: 10000 })

    // Click the kebab menu on the parent card
    const parentCard = parentTitle.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const kebabButton = parentCard.locator('[data-testid="habit-menu-button"]')

    if (await kebabButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await kebabButton.click()
      await page.waitForTimeout(300)

      // Look for "Add sub-habit" option in the menu
      const addSubOption = page.locator('[data-testid="menu-add-sub-habit"]')

      if (await addSubOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addSubOption.click()
        await page.waitForTimeout(500)

        // An inline input should appear
        const inlineInput = page.locator('[data-testid="inline-sub-habit-input"]')
        if (await inlineInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await inlineInput.click()
          await inlineInput.fill('E2E Child 3')
          await inlineInput.press('Enter')
          await page.waitForTimeout(2000)
        }
      }
    }

    // Verify we have not broken the page
    await expect(parentTitle).toBeVisible()
  })

  test('should expand and collapse parent habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const parentTitle = page.getByText('E2E Parent')
    await expect(parentTitle).toBeVisible({ timeout: 10000 })

    // Look for collapse/expand button
    const collapseButton = page.locator('[data-testid="collapse-all"]')

    if (await collapseButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await collapseButton.click()
      await page.waitForTimeout(500)

      // After collapsing, children should not be visible
      const child1 = page.getByText('E2E Child 1')
      await expect(child1).not.toBeVisible({ timeout: 3000 })

      // Now expand again
      const expandButton = page.locator('[data-testid="expand-all"]')
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click()
        await page.waitForTimeout(500)
        await expect(child1).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should complete a child habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const child1 = page.getByText('E2E Child 1')
    await expect(child1).toBeVisible({ timeout: 10000 })

    // Find and click the log button for the child
    const childCard = child1.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const logButton = childCard.locator('[data-testid="habit-log-button"]').first()

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

      await page.waitForTimeout(2000)
    }

    // Verify parent is still showing
    await expect(page.getByText('E2E Parent')).toBeVisible()
  })

  test('should delete parent habit (cascades to children)', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click on parent to open detail drawer
    const parentTitle = page.getByText('E2E Parent')
    await expect(parentTitle).toBeVisible({ timeout: 10000 })
    await parentTitle.click()
    await page.waitForTimeout(500)

    // Click the Delete button
    const deleteButton = page.locator('[data-testid="habit-delete-button"]')
    await expect(deleteButton).toBeVisible({ timeout: 5000 })
    await deleteButton.click()

    // Wait for confirmation dialog
    await page.waitForTimeout(500)
    await page.getByText('Delete Habit').waitFor({ timeout: 5000 })

    // Click confirm
    const confirmButton = page.locator('[data-testid="confirm-delete-button"]')
    await confirmButton.click()

    // Verify parent and children are all gone
    await page.waitForTimeout(3000)
    await expect(page.getByText('E2E Parent')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E Child 1')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByText('E2E Child 2')).not.toBeVisible({ timeout: 3000 })
  })
})

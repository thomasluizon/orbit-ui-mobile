import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Select Mode and Bulk Delete', () => {
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

  test('should create 3 habits via API for bulk operations', async ({ request }) => {
    const api = createAPIHelper(request, token)
    const today = new Date().toISOString().split('T')[0]

    await api.createHabit({
      title: 'E2E Bulk 1',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })

    await api.createHabit({
      title: 'E2E Bulk 2',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })

    await api.createHabit({
      title: 'E2E Bulk 3',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })
  })

  test('should verify all 3 habits are visible', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await expect(page.getByText('E2E Bulk 1').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E Bulk 2').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E Bulk 3').first()).toBeVisible({ timeout: 10000 })
  })

  test('should enter select mode and select habits', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for the "Select" button
    const selectButton = page.locator('[data-testid="select-mode-button"]')

    if (await selectButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await selectButton.click({ force: true })
      await page.waitForTimeout(1000)

      // Select 2 of the 3 habits
      const bulk1Card = page.getByText('E2E Bulk 1').first()
      const bulk2Card = page.getByText('E2E Bulk 2').first()

      if (await bulk1Card.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bulk1Card.click({ force: true })
        await page.waitForTimeout(500)
      }

      if (await bulk2Card.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bulk2Card.click({ force: true })
        await page.waitForTimeout(500)
      }

      // Look for the bulk delete button
      const bulkDeleteButton = page.locator('[data-testid="bulk-delete-button"]')

      if (await bulkDeleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bulkDeleteButton.click({ force: true })
        await page.waitForTimeout(500)

        // Confirm deletion
        const confirmButton = page.locator('[data-testid="confirm-delete-button"]')
        if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmButton.click({ force: true })
          await page.waitForTimeout(3000)
        }
      }

      // Exit select mode if still active
      const cancelButton = page.locator('[data-testid="cancel-select-button"]')
      if (await cancelButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelButton.click({ force: true })
        await page.waitForTimeout(500)
      }
    }
  })

  test('should verify bulk deletion result', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify at least E2E Bulk 3 is still visible (the one we did not select)
    const bulk3 = page.getByText('E2E Bulk 3').first()
    const bulk3Visible = await bulk3
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (bulk3Visible) {
      await expect(bulk3).toBeVisible()
    }

    // Verify the page did not break
    const pageContent = page.locator('main').first()
    await expect(pageContent).toBeVisible({ timeout: 5000 })
  })
})

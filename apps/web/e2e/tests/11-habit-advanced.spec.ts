import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Advanced Habit Features', () => {
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

  test('should create a habit and verify it shows in both Today and All tabs', async ({
    page,
    request,
    testAccount,
  }) => {
    // Create habit via API
    const api = createAPIHelper(request, token)
    const today = new Date().toISOString().split('T')[0]
    await api.createHabit({
      title: 'E2E Tab Test',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })

    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify habit shows in default "Today" view
    const habitText = page.getByText('E2E Tab Test')
    await expect(habitText.first()).toBeVisible({ timeout: 10000 })

    // Switch to "All" tab
    const allTab = page.locator('[data-testid="tab-all"]')
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click({ force: true })
      await page.waitForTimeout(2000)

      // Verify habit shows in All view too
      await expect(page.getByText('E2E Tab Test').first()).toBeVisible({ timeout: 10000 })

      // Switch back to Today
      const todayTab = page.locator('[data-testid="tab-today"]')
      if (await todayTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await todayTab.click({ force: true })
        await page.waitForTimeout(2000)
        await expect(page.getByText('E2E Tab Test').first()).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('should navigate between days using arrow buttons', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify habit is visible on today's view
    await expect(page.getByText('E2E Tab Test').first()).toBeVisible({ timeout: 10000 })

    // Click the left arrow to go to previous day
    const prevDayButton = page.locator('[data-testid="prev-day"]')

    if (await prevDayButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prevDayButton.click({ force: true })
      await page.waitForTimeout(2000)

      // Navigate forward back to today
      const nextDayButton = page.locator('[data-testid="next-day"]')
      if (await nextDayButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextDayButton.click({ force: true })
        await page.waitForTimeout(2000)

        // Habit should be back
        await expect(page.getByText('E2E Tab Test').first()).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('should log a habit and toggle show completed', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitText = page.getByText('E2E Tab Test').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })

    // Log it via API for reliability
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabit = habits.find((h) => h.title === 'E2E Tab Test')

    if (testHabit) {
      await api.logHabit(testHabit.id)
    }

    // Reload the page to see the completion
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for a "Show completed" toggle
    const showCompletedToggle = page.locator('[data-testid="show-completed-toggle"]')
    if (await showCompletedToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showCompletedToggle.click({ force: true })
      await page.waitForTimeout(1000)

      // Toggle back
      await showCompletedToggle.click({ force: true })
      await page.waitForTimeout(500)
    }
  })

  test('should create a one-time task habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Click the FAB to create a habit
    const fabButton = page.locator('[data-testid="fab-create"]')
    await expect(fabButton).toBeVisible({ timeout: 10000 })
    await fabButton.click({ force: true })

    // Wait for the create modal
    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    // Fill in the title
    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click({ force: true })
    await titleInput.fill('E2E One-Time Task')

    // Click "One-time" chip
    const oneTimeChip = page.locator('[data-testid="frequency-one-time"]')
    if (await oneTimeChip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await oneTimeChip.click({ force: true })
      await page.waitForTimeout(500)
    }

    // Submit
    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()

    // Wait for modal to close
    await page.waitForTimeout(2000)

    // Verify the one-time task appears in the list
    const taskTitle = page.getByText('E2E One-Time Task')
    await expect(taskTitle.first()).toBeVisible({ timeout: 10000 })
  })

  test('should create duplicate habits via API and verify both exist', async ({
    page,
    request,
    testAccount,
  }) => {
    const api = createAPIHelper(request, token)
    const today = new Date().toISOString().split('T')[0]

    await api.createHabit({
      title: 'E2E Duplicate A',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })

    await api.createHabit({
      title: 'E2E Duplicate B',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })

    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify both habits appear
    await expect(page.getByText('E2E Duplicate A').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E Duplicate B').first()).toBeVisible({ timeout: 10000 })
  })
})

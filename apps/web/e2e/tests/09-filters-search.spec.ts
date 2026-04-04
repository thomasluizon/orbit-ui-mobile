import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Filters and Search', () => {
  let token = ''
  const createdHabitIds: string[] = []

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)

    // Clean up existing test habits
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E '))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }

    // Create 3 habits with different frequencies via API
    const today = new Date().toISOString().split('T')[0]

    const dailyHabit = await api.createHabit({
      title: 'E2E Daily Habit',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })
    createdHabitIds.push((dailyHabit as { id: string }).id)

    const weeklyHabit = await api.createHabit({
      title: 'E2E Weekly Habit',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      dueDate: today,
    })
    createdHabitIds.push((weeklyHabit as { id: string }).id)

    const monthlyHabit = await api.createHabit({
      title: 'E2E Monthly Habit',
      frequencyUnit: 'Month',
      frequencyQuantity: 1,
      dueDate: today,
    })
    createdHabitIds.push((monthlyHabit as { id: string }).id)
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    if (createdHabitIds.length > 0) {
      await api.bulkDeleteHabits(createdHabitIds)
    }
    // Catch any stragglers
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E '))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }
  })

  test('should display all 3 test habits', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await dismissOverlays(page)

    // Switch to "All" view to see all habits regardless of schedule
    const allTab = page.locator('[data-testid="tab-all"]')
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click()
      await page.waitForTimeout(2000)
    }

    // Verify all 3 habits are visible
    await expect(page.getByText('E2E Daily Habit')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E Weekly Habit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('E2E Monthly Habit')).toBeVisible({ timeout: 5000 })
  })

  test('should search for "Daily" and filter results', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await dismissOverlays(page)

    // Switch to "All" view
    const allTab = page.locator('[data-testid="tab-all"]')
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click()
      await page.waitForTimeout(2000)
    }

    // Find the search input
    const searchInput = page.locator('[data-testid="habit-search-input"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    // Type "Daily" in search
    await searchInput.fill('Daily')
    await page.waitForTimeout(2000)

    // Verify only the daily habit is visible
    await expect(page.getByText('E2E Daily Habit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('E2E Weekly Habit')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByText('E2E Monthly Habit')).not.toBeVisible({ timeout: 3000 })
  })

  test('should clear search and show all habits again', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await dismissOverlays(page)

    // Switch to "All" view
    const allTab = page.locator('[data-testid="tab-all"]')
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click()
      await page.waitForTimeout(2000)
    }

    // Search for "Daily" first
    const searchInput = page.locator('[data-testid="habit-search-input"]')
    await searchInput.fill('Daily')
    await page.waitForTimeout(1000)

    // Clear the search
    const clearButton = page.locator('[data-testid="search-clear"]')
    if (await clearButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearButton.click()
    } else {
      await searchInput.clear()
    }

    await page.waitForTimeout(2000)

    // Verify all habits are visible again
    await expect(page.getByText('E2E Daily Habit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('E2E Weekly Habit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('E2E Monthly Habit')).toBeVisible({ timeout: 5000 })
  })

  test('should filter by daily frequency chip', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await dismissOverlays(page)

    // Switch to "All" view
    const allTab = page.locator('[data-testid="tab-all"]')
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click()
      await page.waitForTimeout(2000)
    }

    // Find the filter area and click "Daily" chip
    const dailyChip = page.locator('[data-testid="filter-daily"]')
    if (await dailyChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dailyChip.click()
      await page.waitForTimeout(2000)

      // Verify only daily habit is visible
      await expect(page.getByText('E2E Daily Habit')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('E2E Weekly Habit')).not.toBeVisible({ timeout: 3000 })
      await expect(page.getByText('E2E Monthly Habit')).not.toBeVisible({ timeout: 3000 })
    }
  })

  test('should clear frequency filter and show all', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Switch to "All" view
    const allTab = page.locator('[data-testid="tab-all"]')
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click()
      await page.waitForTimeout(2000)
    }

    // Click "All" chip to reset filter
    const allChip = page.locator('[data-testid="filter-all"]')
    if (await allChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await allChip.click()
      await page.waitForTimeout(2000)
    }

    // Verify all habits are back
    await expect(page.getByText('E2E Daily Habit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('E2E Weekly Habit')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('E2E Monthly Habit')).toBeVisible({ timeout: 5000 })
  })
})

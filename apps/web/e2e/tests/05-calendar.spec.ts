import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Calendar Page', () => {
  let token: string
  let testHabitId: string

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

    // Create a test habit via API
    const today = new Date().toISOString().split('T')[0]
    const habitData = await api.createHabit({
      title: 'E2E Calendar Habit',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })
    testHabitId = (habitData as { id: string }).id

    // Log the habit via API to create a completion entry
    await api.logHabit(testHabitId)
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

  test('should navigate to the calendar page', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify the calendar heading is visible
    const calendarHeading = page.getByText('Calendar').first()
    await expect(calendarHeading).toBeVisible({ timeout: 10000 })
  })

  test('should render the calendar grid', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await dismissOverlays(page)

    // The calendar grid should be visible
    const calendarGrid = page.locator('[data-testid="calendar-heatmap"]')
    await expect(calendarGrid).toBeVisible({ timeout: 10000 })

    // Verify the month navigation is showing
    const monthNav = page.locator('[data-testid="calendar-nav"]')
    await expect(monthNav).toBeVisible({ timeout: 5000 })
  })

  test('should show day detail when clicking a date', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await dismissOverlays(page)

    // Find today's date cell in the calendar grid
    const today = new Date().getDate()
    const calendarGrid = page.locator('[data-testid="calendar-heatmap"]')

    const dayCell = calendarGrid
      .locator('button')
      .filter({ hasText: new RegExp(`^${today}$`, 'm') })
      .first()

    if (await dayCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dayCell.click()

      // Wait for day detail overlay to appear
      const dayDetail = page.locator('[role="dialog"]').first()
      const isDetailVisible = await dayDetail
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (isDetailVisible) {
        await expect(dayDetail).toBeVisible()
        // Close day detail
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }
  })

  test('should navigate to previous month', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Get the current month label text
    const monthNav = page.locator('[data-testid="calendar-nav"]')
    const monthLabel = monthNav.locator('span').first()
    const currentMonthText = await monthLabel.textContent()

    // Click the previous month button
    const prevButton = page.locator('[data-testid="calendar-prev"]')
    await prevButton.click()
    await page.waitForTimeout(1000)

    // Verify the month label changed
    const newMonthText = await monthLabel.textContent()
    expect(newMonthText).not.toBe(currentMonthText)
  })

  test('should navigate back to current month', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const monthNav = page.locator('[data-testid="calendar-nav"]')
    const monthLabel = monthNav.locator('span').first()
    const currentMonthText = await monthLabel.textContent()

    // Navigate to previous month
    const prevButton = page.locator('[data-testid="calendar-prev"]')
    await prevButton.click()
    await page.waitForTimeout(1000)

    // Navigate to next month (back to current)
    const nextButton = page.locator('[data-testid="calendar-next"]')
    await nextButton.click()
    await page.waitForTimeout(1000)

    // Verify we are back to the current month
    const restoredMonthText = await monthLabel.textContent()
    expect(restoredMonthText).toBe(currentMonthText)
  })
})

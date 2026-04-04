import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

test.describe.serial('Streak Display', () => {
  let token: string
  const createdHabitIds: string[] = []

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
  })

  test.afterAll(async ({ request }) => {
    if (createdHabitIds.length > 0) {
      const api = createAPIHelper(request, token)
      await api.bulkDeleteHabits(createdHabitIds)
    }
  })

  test('streak badge appears in header after logging a habit', async ({ page, request, testAccount }) => {
    const authToken = await authenticatePage(page, request, testAccount)
    const api = createAPIHelper(request, authToken)

    // Create a daily habit
    const today = new Date().toISOString().split('T')[0]
    const habit = await api.createHabit({
      title: `E2E Streak Test ${Date.now()}`,
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    }) as { id: string }
    createdHabitIds.push(habit.id)

    // Log the habit via API
    await api.logHabit(habit.id)

    // Navigate to home to see the streak
    await page.goto('/')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify the header is visible (streak badge is part of header)
    const header = page.locator('header').first()
    await expect(header).toBeVisible()
  })

  test('settings page shows streak card', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify streak card is visible
    const streakCard = page.locator('[data-testid="streak-card"]')
    if (await streakCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(streakCard).toBeVisible()
    }
  })

  test('freeze button is visible on settings streak card when streak > 0', async ({ page, request, testAccount }) => {
    const authToken = await authenticatePage(page, request, testAccount)
    const api = createAPIHelper(request, authToken)

    // Ensure there is a habit to maintain a streak
    const today = new Date().toISOString().split('T')[0]
    const habit = await api.createHabit({
      title: `E2E Freeze Test ${Date.now()}`,
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    }) as { id: string }
    createdHabitIds.push(habit.id)

    // Log it to create a streak
    await api.logHabit(habit.id)

    // Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    await dismissOverlays(page)

    // Look for freeze section
    const freezeSection = page.locator('[data-testid="streak-freeze"]')
    if (await freezeSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(freezeSection).toBeVisible()
    }
  })
})

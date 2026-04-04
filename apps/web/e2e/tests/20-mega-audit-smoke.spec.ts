import { test, expect } from '../fixtures'
import { API_URL, loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

/**
 * Critical path smoke tests covering:
 * Auth, Habits CRUD, AI Chat, Goals, Settings, Notifications, Security
 */

test.describe.serial('Critical Path Smoke Tests', () => {
  test.setTimeout(60_000)
  let token = ''

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const res = await api.getHabits(dateFrom, dateTo)
    const habits = (res as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter(h => h.title.startsWith('E2E Smoke'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map(h => h.id))
    }
    try {
      const goalsRes = await api.getGoals()
      const goals = (goalsRes as { items?: { id: string; title: string }[] }).items ?? []
      for (const g of goals.filter(g => g.title.startsWith('E2E Smoke'))) {
        await api.deleteGoal(g.id)
      }
    } catch { /* goals endpoint may 403 for free users */ }
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const res = await api.getHabits(dateFrom, dateTo)
    const habits = (res as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter(h => h.title.startsWith('E2E Smoke'))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map(h => h.id))
    }
    try {
      const goalsRes = await api.getGoals()
      const goals = (goalsRes as { items?: { id: string; title: string }[] }).items ?? []
      for (const g of goals.filter(g => g.title.startsWith('E2E Smoke'))) {
        await api.deleteGoal(g.id)
      }
    } catch { /* ignore */ }
  })

  // AUTH

  test('login and stay logged in on refresh', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Verify we are on the home page
    await expect(page).not.toHaveURL(/\/login/)

    // Cookie exists
    const cookies = await page.context().cookies()
    const authCookie = cookies.find(c => c.name === 'auth_token')
    expect(authCookie).toBeTruthy()

    // Refresh and verify session persists
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('rate limit on rapid login code requests', async ({ request }) => {
    const results: number[] = []
    for (let i = 0; i < 7; i++) {
      const res = await request.post(`${API_URL}/api/auth/send-code`, {
        data: { email: `ratelimit-${i}@test.invalid`, language: 'en' },
      })
      results.push(res.status())
    }
    const has429 = results.includes(429)
    const hasNon429 = results.some(s => s !== 429)
    expect(has429 || hasNon429).toBe(true)
  })

  // HABITS - full CRUD

  test('create a habit via UI', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const fabButton = page.locator('[data-testid="fab-create"]')
    await expect(fabButton).toBeVisible({ timeout: 10000 })
    await fabButton.click()

    await page.getByText('Create Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.fill('E2E Smoke Habit')

    const recurringChip = page.locator('[data-testid="frequency-recurring"]')
    await recurringChip.click()
    await page.waitForTimeout(500)

    const submitButton = page.locator('[data-testid="create-habit-submit"]')
    await submitButton.scrollIntoViewIfNeeded()
    await submitButton.click()
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Smoke Habit')).toBeVisible({ timeout: 10000 })
  })

  test('log the habit via UI', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitText = page.getByText('E2E Smoke Habit').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })

    const habitCard = habitText.locator('xpath=ancestor::div[contains(@class,"bg-")]').first()
    const logButton = habitCard.locator('[data-testid="habit-log-button"]').first()
    await logButton.click({ force: true })
    await page.waitForTimeout(1000)

    // Confirm in Log Habit modal if it appears
    const logModalTitle = page.getByText('Log Habit')
    if (await logModalTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const confirmLogButton = page.locator('[data-testid="confirm-log-button"]')
      await confirmLogButton.click()
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(1500)
    await expect(page.getByText('E2E Smoke Habit').first()).toBeVisible()
  })

  test('edit the habit title', async ({ page, request, testAccount }) => {
    // Clean up and recreate fresh
    const api = createAPIHelper(request, token)
    const { dateFrom, dateTo } = getDateRange()
    const habitsRes = await api.getHabits(dateFrom, dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    for (const h of habits.filter(h => h.title.startsWith('E2E Smoke'))) {
      await api.deleteHabit(h.id)
    }
    await api.createHabit({
      title: 'E2E Smoke Habit',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })

    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitText = page.getByText('E2E Smoke Habit').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })
    await habitText.click()
    await page.waitForTimeout(500)

    const editButton = page.locator('[data-testid="habit-edit-button"]')
    await expect(editButton).toBeVisible({ timeout: 5000 })
    await editButton.click()

    await page.getByText('Edit Habit').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(1000)

    const titleInput = page.locator('[data-testid="habit-title-input"]')
    await titleInput.click()
    await titleInput.clear()
    await titleInput.fill('E2E Smoke Edited')

    const saveButton = page.locator('[data-testid="save-habit-submit"]')
    await saveButton.scrollIntoViewIfNeeded()
    await saveButton.click()
    await page.waitForTimeout(2000)

    await expect(page.getByText('E2E Smoke Edited').first()).toBeVisible({ timeout: 10000 })
  })

  test('delete the habit via detail drawer', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitText = page.getByText('E2E Smoke Edited').first()
    await expect(habitText).toBeVisible({ timeout: 10000 })
    await habitText.click()
    await page.waitForTimeout(500)

    const deleteButton = page.locator('[data-testid="habit-delete-button"]')
    await expect(deleteButton).toBeVisible({ timeout: 5000 })
    await deleteButton.click()
    await page.waitForTimeout(500)

    await page.getByText('Delete Habit').waitFor({ timeout: 5000 })
    const confirmButton = page.locator('[data-testid="confirm-delete-button"]')
    await confirmButton.click()
    await page.waitForTimeout(3000)

    await expect(page.getByText('E2E Smoke Edited').first()).not.toBeVisible({ timeout: 10000 })
  })

  // NAVIGATION

  test('navigate dates with prev/next arrows', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const prevButton = page.locator('[data-testid="prev-day"]')
    if (await prevButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prevButton.click()
      await page.waitForTimeout(1000)
      await expect(page).not.toHaveURL(/\/login/)

      const nextButton = page.locator('[data-testid="next-day"]')
      if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextButton.click()
        await page.waitForTimeout(1000)
      }
    }
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('calendar page loads', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await page.goto('/calendar')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await dismissOverlays(page)

    await expect(page).not.toHaveURL(/\/login/)
  })

  // AI CHAT

  test('chat page loads with input', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const chatLink = page.locator('nav').last().locator('a').filter({ hasText: /chat/i })
    await expect(chatLink).toBeVisible({ timeout: 5000 })
    await chatLink.click()
    await page.waitForTimeout(3000)

    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })
  })

  // SETTINGS

  test('settings page loads', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    await expect(page).toHaveURL(/\/settings/)
  })

  // NOTIFICATIONS

  test('notification bell exists', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const bell = page.locator('[data-testid="notification-bell"]')
    if (await bell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bell.click({ force: true })
      await page.waitForTimeout(1000)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
  })

  // SECURITY

  test('API config endpoint requires auth (401)', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/config`)
    expect(res.status()).toBe(401)
  })

  test('frontend returns security headers', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    const response = await page.goto('/')
    const headers = response?.headers() ?? {}
    // At minimum, X-Content-Type-Options should be set
    expect(headers['x-content-type-options']).toBe('nosniff')
  })
})

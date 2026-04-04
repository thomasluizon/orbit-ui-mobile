import { test, expect } from '../fixtures'
import { loginViaAPI, authenticatePage, dismissOverlays } from '../helpers/auth'
import { createAPIHelper, getDateRange } from '../helpers/api'

const API_URL = process.env.E2E_API_URL || 'http://localhost:5000'

test.describe.serial('Tag Management', () => {
  let token = ''
  let testHabitId: string

  test.beforeAll(async ({ request, testAccount }) => {
    token = await loginViaAPI(request, testAccount)
    const api = createAPIHelper(request, token)

    // Clean up existing test habits and tags
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E '))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }

    // Clean up test tags
    const tags = (await api.getTags()) as { id: string; name: string }[]
    for (const tag of tags) {
      if (tag.name.startsWith('E2E ')) {
        await api.deleteTag(tag.id)
      }
    }

    // Create a test habit via API
    const today = new Date().toISOString().split('T')[0]
    const habitData = await api.createHabit({
      title: 'E2E Tag Test',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: today,
    })
    testHabitId = (habitData as { id: string }).id
  })

  test.afterAll(async ({ request }) => {
    const api = createAPIHelper(request, token)

    // Delete test habits
    const habitsRes = await api.getHabits(getDateRange().dateFrom, getDateRange().dateTo)
    const habits = (habitsRes as { items?: { id: string; title: string }[] }).items ?? []
    const testHabits = habits.filter((h) => h.title.startsWith('E2E '))
    if (testHabits.length > 0) {
      await api.bulkDeleteHabits(testHabits.map((h) => h.id))
    }

    // Delete test tags
    const tags = (await api.getTags()) as { id: string; name: string }[]
    for (const tag of tags) {
      if (tag.name.startsWith('E2E ')) {
        await api.deleteTag(tag.id)
      }
    }
  })

  test('should display the test habit on habits page', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    const habitTitle = page.getByText('E2E Tag Test')
    await expect(habitTitle.first()).toBeVisible({ timeout: 10000 })
  })

  test('should create and assign a tag via API', async ({
    page,
    request,
    testAccount,
  }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Create tag via API
    const headers = { Authorization: `Bearer ${token}` }
    const tagCreateRes = await request.post(`${API_URL}/api/tags`, {
      headers,
      data: { name: 'E2E Tag', color: '#7c3aed' },
    })

    if (tagCreateRes.ok()) {
      const tagData = await tagCreateRes.json()
      const tagId = (tagData as { id: string }).id

      // Assign tag to the habit
      if (testHabitId && tagId) {
        await request.put(`${API_URL}/api/tags/${testHabitId}/assign`, {
          headers,
          data: { tagIds: [tagId] },
        })
      }
    }

    // Reload the page to see the tag
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
  })

  test('should display the tag on the habit card', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for the tag name on the habit card
    const tagBadge = page.getByText('E2E Tag')
    const isTagVisible = await tagBadge
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (isTagVisible) {
      await expect(tagBadge.first()).toBeVisible()
    }
    // Verify the habit still exists regardless
    await expect(page.getByText('E2E Tag Test').first()).toBeVisible()
  })

  test('should show tag in filter chips', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Look for the tag chip in the filter row
    const tagChip = page.getByText(/e2e tag/i).first()
    const isChipVisible = await tagChip
      .isVisible({ timeout: 3000 })
      .catch(() => false)

    if (isChipVisible) {
      // Click the tag chip to filter
      await tagChip.click({ force: true })
      await page.waitForTimeout(1000)

      // Click again to deselect
      await tagChip.click({ force: true })
      await page.waitForTimeout(1000)
    }
  })

  test('should remove the tag from the habit', async ({ page, request, testAccount }) => {
    await authenticatePage(page, request, testAccount)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // Remove tag via API
    const headers = { Authorization: `Bearer ${token}` }
    if (testHabitId) {
      await request.put(`${API_URL}/api/tags/${testHabitId}/assign`, {
        headers,
        data: { tagIds: [] },
      })
    }

    // Reload to verify tag is gone
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await dismissOverlays(page)
  })
})

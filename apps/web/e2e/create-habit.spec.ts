import { test, expect } from '@playwright/test'
import { listHabitTitles } from './support/api'
import { smokeLabel } from './support/unique'

test('create a habit from the Today FAB', async ({ page }) => {
  const title = smokeLabel('create')

  await page.goto('/')

  await page.locator('[data-tour="tour-fab-button"]').click()

  const titleInput = page.locator('#habit-form-title')
  await expect(titleInput).toBeVisible()
  await titleInput.fill(title)

  const submit = page.getByTestId('habit-create-submit')
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(titleInput).toBeHidden()
  await expect
    .poll(() => listHabitTitles(page.request), { timeout: 30_000, intervals: [1_000] })
    .toContain(title)

  await page.reload()
  await expect(page.locator(`[data-habit-title="${title}"]`)).toBeVisible()
})

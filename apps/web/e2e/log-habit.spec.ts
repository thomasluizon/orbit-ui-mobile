import { test, expect } from '@playwright/test'
import { smokeLabel } from './support/unique'

test('log a habit from the Today list', async ({ page }) => {
  const title = smokeLabel('log')

  await page.goto('/')

  await page.locator('[data-tour="tour-fab-button"]').click()
  const titleInput = page.locator('#habit-form-title')
  await expect(titleInput).toBeVisible()
  await titleInput.fill(title)
  const submit = page.getByTestId('habit-create-submit')
  await expect(submit).toBeEnabled()
  await submit.click()

  const row = page.locator(`[data-habit-title="${title}"]`)
  await expect(row).toBeVisible()

  const toggle = row.getByTestId('habit-status-toggle')
  const initialState = await toggle.getAttribute('aria-label')
  await toggle.click()

  await expect(toggle).not.toHaveAttribute('aria-label', initialState ?? '')
})

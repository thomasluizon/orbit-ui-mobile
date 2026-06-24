import { test, expect } from '@playwright/test'
import { listHabitTitles } from './support/api'
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

  await expect(titleInput).toBeHidden()
  await expect
    .poll(() => listHabitTitles(page.request), { timeout: 30_000, intervals: [1_000] })
    .toContain(title)

  await page.reload()

  const row = page.locator(`[data-habit-title="${title}"]`)
  await expect(row).toBeVisible()

  const toggle = row.getByTestId('habit-status-toggle')
  await expect(toggle).toBeEnabled()
  const initialState = await toggle.getAttribute('aria-label')

  const logged = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && 'next-action' in response.request().headers(),
    { timeout: 30_000 },
  )
  await toggle.dispatchEvent('click')
  const logResponse = await logged
  expect(logResponse.ok()).toBeTruthy()

  await expect(toggle).not.toHaveAttribute('aria-label', initialState ?? '')
})

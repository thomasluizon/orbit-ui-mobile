import { test, expect } from '@playwright/test'
import { listHabitTitles } from './support/api'
import { smokeLabel } from './support/unique'
import { createSmokeHabit, logSmokeHabit } from './support/smoke-adapters'

test('log a habit from the Today list', async ({ page }) => {
  const title = smokeLabel('log')

  await page.goto('/')

  await createSmokeHabit(page, title)
  await expect
    .poll(() => listHabitTitles(page.request), { timeout: 30_000, intervals: [1_000] })
    .toContain(title)

  const row = page.locator(`[data-habit-title="${title}"]`)
  await expect(async () => {
    await page.reload()
    await expect(row).toBeVisible({ timeout: 10_000 })
  }).toPass({ timeout: 60_000 })

  await logSmokeHabit(page, title)
})

import { test, expect } from '@playwright/test'
import { listHabitTitles } from './support/api'
import { smokeLabel } from './support/unique'
import { createSmokeHabit } from './support/smoke-adapters'

test('create a habit from the Today FAB', async ({ page }) => {
  const title = smokeLabel('create')

  await page.goto('/')

  await createSmokeHabit(page, title)
  await expect
    .poll(() => listHabitTitles(page.request), { timeout: 30_000, intervals: [1_000] })
    .toContain(title)
})

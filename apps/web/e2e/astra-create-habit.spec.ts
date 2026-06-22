import { test, expect } from '@playwright/test'
import { listHabitTitles } from './support/api'
import { smokeLabel } from './support/unique'

test('Astra creates a habit from a chat message', async ({ page }) => {
  const title = smokeLabel('astra')

  await page.goto('/chat')

  const input = page.getByTestId('chat-input')
  await expect(input).toBeVisible()
  await input.fill(`Create a daily habit named exactly "${title}". Do not ask for any other details.`)
  await page.getByTestId('chat-send').click()

  const confirm = page.getByTestId('pending-op-confirm')
  const confirmAppeared = await confirm
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then(() => true)
    .catch(() => false)
  if (confirmAppeared) {
    await confirm.click()
  }

  await expect
    .poll(async () => listHabitTitles(page.request), { timeout: 60_000, intervals: [2_000] })
    .toContain(title)
})

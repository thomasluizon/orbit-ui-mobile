import { test as setup, expect } from '@playwright/test'
import { authenticate } from './support/auth'
import { resetSmokeAccount, warmBackend } from './support/api'
import { STORAGE_STATE_PATH } from './support/env'
import { expectAppNavigation } from './support/smoke-adapters'

setup('authenticate and reset the smoke account', async ({ page }) => {
  await authenticate(page)
  await expect(page).toHaveURL((url) => !url.pathname.startsWith('/login'))

  await resetSmokeAccount(page.request)

  const onboarding = await page.request.put('/api/profile/onboarding')
  expect(onboarding.ok()).toBeTruthy()

  const tour = await page.request.put('/api/profile/tour')
  expect(tour.ok()).toBeTruthy()

  const importPrompt = await page.request.put('/api/profile/import-prompt/dismiss')
  expect(importPrompt.ok()).toBeTruthy()

  await warmBackend(page.request)

  const session = await page.request.get('/api/auth/session')
  expect(session.ok()).toBeTruthy()
  const { userId } = (await session.json()) as { userId: string | null }
  expect(userId).toBeTruthy()

  await page.evaluate((id) => {
    window.localStorage.setItem(`orbit_trial_expired_seen:${id}`, '1')
    window.localStorage.setItem(
      `orbit_tour_sections:v1:${id}`,
      JSON.stringify({ habits: true, goals: true, chat: true, calendar: true, profile: true }),
    )
  }, userId)

  await page.reload()
  await expectAppNavigation(page)

  await page.context().storageState({ path: STORAGE_STATE_PATH })
})

import { test as setup, expect } from '@playwright/test'
import { authenticate } from './support/auth'
import { resetSmokeAccount, warmBackend } from './support/api'
import { STORAGE_STATE_PATH } from './support/env'

setup('authenticate and reset the smoke account', async ({ page }) => {
  await authenticate(page)

  await resetSmokeAccount(page.request)

  const onboarding = await page.request.put('/api/profile/onboarding')
  expect(onboarding.ok()).toBeTruthy()

  await warmBackend(page.request)

  await page.evaluate(() => {
    window.localStorage.setItem('orbit_trial_expired_seen', '1')
  })

  await page.context().storageState({ path: STORAGE_STATE_PATH })
})

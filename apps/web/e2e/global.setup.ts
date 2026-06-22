import { test as setup, expect } from '@playwright/test'
import { authenticate } from './support/auth'
import { resetSmokeAccount } from './support/api'
import { STORAGE_STATE_PATH } from './support/env'

setup('authenticate and reset the smoke account', async ({ page }) => {
  await authenticate(page)

  await resetSmokeAccount(page.request)

  const onboarding = await page.request.put('/api/profile/onboarding')
  expect(onboarding.ok()).toBeTruthy()

  await page.context().storageState({ path: STORAGE_STATE_PATH })
})

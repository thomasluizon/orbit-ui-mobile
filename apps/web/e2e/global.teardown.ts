import { test as teardown } from '@playwright/test'
import { resetSmokeAccount } from './support/api'

teardown('wipe smoke data from prod', async ({ page }) => {
  await resetSmokeAccount(page.request)
})

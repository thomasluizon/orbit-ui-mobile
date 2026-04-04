import { test as base } from '@playwright/test'
import { getTestAccount, type TestAccount } from './helpers/auth'

export const test = base.extend<{}, { testAccount: TestAccount }>({
  testAccount: [async ({}, use, workerInfo) => {
    await use(getTestAccount(workerInfo.parallelIndex))
  }, { scope: 'worker' }],
})

export { expect } from '@playwright/test'

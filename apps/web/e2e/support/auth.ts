import { expect, type Page } from '@playwright/test'
import { smokeEnv } from './env'
import { openSignIn } from './sign-in-entry'

export async function authenticate(page: Page): Promise<void> {
  await openSignIn(page)

  await page.locator('input[name="email"]').fill(smokeEnv.testEmail)
  await page.locator('form:has(input[name="email"])').locator('button[type="submit"]').click()

  const code = page.locator('input[name="verificationCode"][autocomplete="one-time-code"]')
  await expect(code).toBeVisible()
  await code.fill(smokeEnv.testCode)

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

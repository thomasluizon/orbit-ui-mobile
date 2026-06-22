import { expect, type Page } from '@playwright/test'
import { smokeEnv } from './env'

/** The single seam where the prod login mechanism lives. The suite signs in
 *  once (in global setup) through the real passwordless OTP UI, using a fixed
 *  verification code that the backend honors only for the pinned smoke account.
 *  If the auth strategy changes (direct cookie mint, mailbox polling), only this
 *  function changes — every spec keeps using the saved storage state untouched. */
export async function authenticate(page: Page): Promise<void> {
  await page.goto('/login')

  await page.locator('#login-email').fill(smokeEnv.testEmail)
  await page.getByTestId('auth-send-code').click()

  const firstCodeBox = page.locator('[data-code-index="0"]')
  await expect(firstCodeBox).toBeVisible()

  const digits = [...smokeEnv.testCode]
  for (const [index, digit] of digits.entries()) {
    await page.locator(`[data-code-index="${index}"]`).fill(digit)
  }

  await page.getByTestId('auth-verify-code').click()

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

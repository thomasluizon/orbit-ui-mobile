import { expect, type Page } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

export async function openSignIn(page: Page): Promise<void> {
  await page.goto('/login')

  const email = page.locator('input[name="email"]')
  const accountAction = page.getByRole('button', { name: en.onboarding.flow.what.haveAccount, exact: true })
    .or(page.getByRole('button', { name: ptBR.onboarding.flow.what.haveAccount, exact: true }))
  await expect(email.or(accountAction)).toBeVisible()

  if (await accountAction.isVisible()) {
    await accountAction.click()
    await page.waitForURL((url) => url.pathname === '/login')
  }

  await expect(email).toBeVisible()
}

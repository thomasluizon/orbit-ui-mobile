import { setLayoutFixtureSession } from './profile-session'
import { expect, type Page } from '@playwright/test'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { test } from './upgrade-fixtures'

async function openProfile(page: Page) {
  await page.goto('/profile')
  await expect(page.getByTestId('profile-settings-groups')).toBeVisible()
  await page.evaluate(() => { document.documentElement.dataset.navigationSession = 'profile' })
}

async function assertPushedHeader(page: Page, title: string, backLabel: string) {
  await page.waitForTimeout(500)
  const header = page.locator('[data-shell-header]')
  const heading = header.getByRole('heading', { level: 1, name: title, exact: true })
  const back = header.getByRole('button', { name: backLabel, exact: true })
  await expect(heading).toBeVisible()
  await expect(back).toBeVisible()
  await expect(page.locator('h1:visible')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-navigation-session', 'profile')
  const bounds = await back.evaluate((element) => {
    const rectangle = element.getBoundingClientRect()
    return {
      width: rectangle.width,
      height: rectangle.height,
      insideViewport: rectangle.left >= 0 && rectangle.top >= 0
        && rectangle.right <= innerWidth && rectangle.bottom <= innerHeight,
    }
  })
  expect(bounds.width).toBeGreaterThanOrEqual(44)
  expect(bounds.height).toBeGreaterThanOrEqual(44)
  expect(bounds.insideViewport).toBe(true)
  await back.click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByTestId('profile-settings-groups')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-navigation-session', 'profile')
}

for (const width of [320, 412, 600, 1280, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : ptBR
    test.describe(`Profile pushed headers at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale })

      if (width === 412) {
        test('top-level entries fit the phone viewport', async ({ page }) => {
          await openProfile(page)
          const bounds = await page.getByTestId('profile-settings-groups').evaluate((element) => {
            const rectangle = element.getBoundingClientRect()
            return { left: rectangle.left, right: rectangle.right, bottom: rectangle.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight }
          })
          expect(bounds.left).toBeGreaterThanOrEqual(0)
          expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth)
          expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight)
        })
      }

      for (const [path, label, title] of [
        ['/support', messages.profile.support.rowTitle, messages.profile.support.title],
        ['/about', messages.profile.aboutRow, messages.about.title],
        ['/profile/account', null, messages.profile.submenus.account],
        ['/profile/preferences', messages.profile.submenus.preferences, messages.profile.submenus.preferences],
        ['/profile/astra', messages.profile.groups.astra, messages.profile.groups.astra],
        ['/profile/notifications', messages.profile.groups.notifications, messages.profile.groups.notifications],
      ] as const) {
        test(`${path} retains its header after client navigation`, async ({ page }) => {
          await openProfile(page)
          if (label === null) await page.locator(`a[href="${path}"]`).click()
          else await page.getByRole('link', { name: label, exact: true }).click()
          await expect(page).toHaveURL(new RegExp(`${path}$`))
          if (path.startsWith('/profile/')) {
            await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeFocused()
            await expect(page).toHaveTitle(`${title} · Orbit`)
          }
          await assertPushedHeader(page, title, messages.common.backToProfile)
        })
      }

      test('notification inbox retains its header after a client push', async ({ page }) => {
        await openProfile(page)
        await page.evaluate(() => {
          const runtime = window as unknown as { next: { router: AppRouterInstance } }
          runtime.next.router.push('/notifications')
        })
        await expect(page).toHaveURL(/\/notifications$/)
        await assertPushedHeader(page, messages.notifications.title, messages.common.back)
      })

      test('API keys live in the Astra sub-screen', async ({ page }) => {
        await openProfile(page)
        await page.getByRole('link', { name: messages.profile.groups.astra, exact: true }).click()
        const keys = page.getByTestId('profile-api-keys')
        await expect(keys.getByRole('heading', { name: messages.profile.settingsRows.apiKeysMcp })).toBeVisible()
        await expect(keys.getByRole('button', { name: messages.profile.apiKeys.unlock, exact: true })).toBeVisible()
        await expect(page).toHaveURL(/\/profile\/astra$/)
      })

      test.describe('paid subscription', () => {
        test.use({ subscriptionState: 'stripe' })
        test('management retains its header after client navigation', async ({ page, context }) => {
          const profile = profileSchema.parse({
            ...profileFixture,
            language: locale,
            plan: 'pro',
            hasProAccess: true,
            subscriptionSource: 'stripe',
            subscriptionInterval: 'yearly',
          })
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
          await openProfile(page)
          await page.getByRole('link', { name: messages.profile.groups.astra, exact: true }).click()
          await page.getByRole('link', { name: messages.profile.allowance.manageSubscription, exact: true }).click()
          await expect(page).toHaveURL(/\/upgrade\?from=%2Fprofile%2Fastra$/)
          await expect(page.getByRole('heading', { level: 1, name: messages.upgrade.title, exact: true })).toBeVisible()
          await page.getByRole('button', { name: messages.common.backToDestination.replace('{destination}', messages.profile.groups.astra), exact: true }).click()
          await expect(page).toHaveURL(/\/profile\/astra$/)
        })
      })
    })
  }
}

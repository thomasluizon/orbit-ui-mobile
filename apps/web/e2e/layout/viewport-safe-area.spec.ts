import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { completeInstallOnboarding } from './install-onboarding'

const HEIGHT = 915
const notification = createMockNotification({ title: 'Layout notification' })
const notifications = notificationsResponseSchema.parse({ items: [notification], unreadCount: 1 })

async function expectInsideInsets(surface: Locator, top: number, bottom: number) {
  await expect(surface).toBeVisible()
  const box = (await surface.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(top)
  expect(box.y + box.height).toBeLessThanOrEqual(HEIGHT - bottom)
}

async function setInsets(page: Page, top: number, bottom: number) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom } })
}

for (const width of [320, 412, 600]) {
  for (const top of [0, 24]) {
    const bottom = top ? 34 : 0
    test.describe(`viewport cover at ${width}px and insets ${top}/${bottom}`, () => {
      test.use({ appLocale: 'en', viewport: { width, height: HEIGHT } })
      test.beforeEach(async ({ page }) => { await setInsets(page, top, bottom) })

      test('Hoje keeps pinned controls and its focused skip link inside the safe viewport', async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /(?:^|,)\s*viewport-fit=cover(?:,|$)/)
        const header = page.locator('[data-shell-header]')
        await expect(header.locator('[data-today-header-actions]')).toBeVisible()
        await page.locator('[data-today-header-actions]').getByRole('button', { name: messages.habits.listOptions, exact: true }).click()
        const panel = page.getByRole('dialog', { name: messages.habits.listOptions })
        await expect(panel).toBeVisible()
        const menuItems = panel.getByRole('menuitem')
        expect(await menuItems.count()).toBeGreaterThan(0)
        for (const item of await menuItems.all()) await expectInsideInsets(item, top, bottom)
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        for (const selector of ['[data-shell-header] button', '[data-shell-pinned-slot] button', '[data-shell-pinned-slot] textarea', '[data-shell-tab-bar] button', '[data-shell-fab] button']) {
          const controls = page.locator(selector).filter({ visible: true })
          expect(await controls.count(), selector).toBeGreaterThan(0)
          for (const control of await controls.all()) await expectInsideInsets(control, top, bottom)
        }
        const skip = page.getByRole('link', { name: messages.common.skipToContent })
        await skip.focus()
        await expectInsideInsets(skip, top, bottom)
        expect((await skip.boundingBox())!.y).toBe(Math.max(16, top))
        expect((await header.boundingBox())!.y).toBe(top)
        const shell = (await page.locator('[data-shell="wide"]').boundingBox())!
        expect(shell.y).toBe(0)
        expect(shell.y + shell.height).toBe(HEIGHT)
        const tabBar = (await page.locator('[data-shell-tab-bar]').boundingBox())!
        expect(tabBar.y + tabBar.height).toBe(HEIGHT - bottom)
      })

      test('the throttle screen keeps its text and retry control inside the safe viewport', async ({ page, context }) => {
        await completeInstallOnboarding(page)
        await context.clearCookies()
        await context.addCookies([{ name: 'i18n_locale', value: 'en', url: LAYOUT_ORIGIN }])
        await context.route(`${LAYOUT_ORIGIN}/api/auth/send-code`, (route) => route.fulfill({
          status: 429,
          json: { retryAfterUtc: '2026-09-04T12:01:00Z' },
        }))
        await page.goto('/login')
        await page.getByRole('textbox', { name: messages.auth.email, exact: true }).fill('layout@example.com')
        await page.getByRole('button', { name: messages.auth.sendCode, exact: true }).click()
        const throttle = page.getByRole('dialog', { name: messages.errorScreen.throttleTitle })
        await expect(throttle).toBeVisible()
        for (const selector of ['h1', '.error-surface-body', '[role="timer"]', 'button']) {
          await expectInsideInsets(throttle.locator(selector), top, bottom)
        }
        const box = (await throttle.boundingBox())!
        expect(box.y).toBe(0)
        expect(box.y + box.height).toBe(HEIGHT)
      })

      test('a queued-delete toast and notice slot stay above the bottom inset', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.notifications.list}`, (route) => route.fulfill({ json: notifications }))
        await page.goto('/notifications')
        await page.getByRole('button', { name: messages.notifications.deleteNotification.replace('{title}', notification.title), exact: true }).click()
        const toast = page.locator('[data-shell-notice] [data-kind="neutral"]').filter({ hasText: messages.notifications.deleteQueued })
        await expectInsideInsets(toast, top, bottom)
        await expectInsideInsets(toast.getByRole('button', { name: messages.notifications.deleteUndo, exact: true }), top, bottom)
        await expectInsideInsets(page.locator('[data-shell-notice]'), top, bottom)
        await toast.getByRole('button', { name: messages.notifications.deleteUndo, exact: true }).click()
        await expect(toast).toHaveCount(0)
      })
    })
  }
}

import { setLayoutFixtureSession } from './profile-session'
import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { test } from './upgrade-fixtures'
import { measureScrollbarGutter } from './scrollbar-geometry'

const notification = createMockNotification({ title: 'Layout notification' })
const notifications = notificationsResponseSchema.parse({ items: [notification], unreadCount: 1 })

async function expectContentEdges(surface: Locator, reference: 'shell-column' | 'notice-column') {
  const gutter = await surface.locator('xpath=ancestor::*[@data-shell-column]')
    .locator('[data-shell-scroller]').evaluate(measureScrollbarGutter)
  const geometry = await surface.evaluate((element, { reference, gutter }) => {
    const contentColumn = reference === 'shell-column'
      ? element.closest('[data-shell-column]')
      : element.closest('[data-shell-notice]')?.parentElement
    if (!contentColumn) throw new Error('Shell content column missing')
    const column = contentColumn.getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    return {
      left: bounds.left,
      right: bounds.right,
      contentLeft: column.left + 16,
      contentRight: column.right - 16 - gutter,
    }
  }, { reference, gutter })
  expect(geometry.left).toBeCloseTo(geometry.contentLeft, 1)
  expect(geometry.right).toBeCloseTo(geometry.contentRight, 1)
}

for (const width of [412, 1352] as const) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const messages = locale === 'en' ? en : ptBR
    test.describe(`shell content edges at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, subscriptionState: 'trial', viewport: { width, height: 915 } })

      test('aligns the queued-delete toast with shell content', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
        await page.goto('/notifications')
        await page.getByRole('button', {
          name: messages.notifications.deleteNotification.replace('{title}', notification.title), exact: true,
        }).click()
        const toast = page.locator('[data-shell-notice] [data-kind="neutral"]')
          .filter({ hasText: messages.notifications.deleteQueued })
        await expect(toast).toBeVisible()
        await page.clock.pauseAt(new Date('2026-09-04T12:00:00Z'))
        await page.evaluate(() => document.fonts.ready)
        await expectContentEdges(toast, 'notice-column')
        await toast.getByRole('button', { name: messages.notifications.deleteUndo, exact: true }).click()
        await expect(toast).toHaveCount(0)
      })

      test('aligns the in-shell missing-page title with shell content without a composer', async ({ page }) => {
        await page.goto('/layout-missing')
        const title = page.getByRole('heading', { name: messages.notFoundPage.title, exact: true })
        await expect(title).toBeVisible()
        await expect(page.locator('[data-composer-root]')).toHaveCount(0)
        await page.evaluate(() => document.fonts.ready)
        await expectContentEdges(title, 'shell-column')
      })
    })
  }
}

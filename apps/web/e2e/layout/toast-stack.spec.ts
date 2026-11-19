import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutFixtureSession } from './profile-session'
import { measureToastStack } from './toast-stack-geometry'
import { test } from './upgrade-fixtures'

const notifications = notificationsResponseSchema.parse({
  items: Array.from({ length: 3 }, (_, index) => createMockNotification({
    id: `toast-stack-${index}`, title: `Notification ${index + 1}`,
  })),
  unreadCount: 3,
})

for (const width of [412, 1352]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`Notice stack at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale, contextOptions: { reducedMotion: 'reduce' } })

      test('shows one delete toast after three deletes, centres its undo label and restores the newest', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
        await page.goto('/notifications')
        await page.evaluate(() => document.fonts.ready)
        const slot = page.locator('[data-shell-notice-content]')
        const toasts = slot.locator('[data-kind]').filter({ hasText: words.notifications.deleteQueued })
        for (const [index, notification] of notifications.items.entries()) {
          await page.getByRole('button', {
            name: words.notifications.deleteNotification.replace('{title}', notification.title), exact: true,
          }).click()
          await expect(toasts).toHaveCount(1)
          if (index === 0) await page.clock.pauseAt(new Date(LAYOUT_FIXED_TIME))
          await expect(async () => {
            const measured = await slot.evaluate(measureToastStack)
            expect(measured).toHaveLength(1)
            expect(measured[0]!.topInset).toBe(0)
            expect(measured[0]!.bottomInset).toBe(0)
            expect(measured[0]!.actionOffset).not.toBeNull()
            expect(Math.abs(measured[0]!.actionOffset!)).toBeLessThanOrEqual(1)
            expect(Math.abs(measured[0]!.closeOffset)).toBeLessThanOrEqual(1)
          }).toPass({ timeout: 3000 })
        }
        await toasts.getByRole('button', { name: words.notifications.deleteUndo, exact: true }).click()
        await expect(toasts).toHaveCount(0)
        const [first, second, third] = notifications.items
        await expect(page.getByText(third!.title, { exact: true })).toBeVisible()
        await expect(page.getByText(first!.title, { exact: true })).toHaveCount(0)
        await expect(page.getByText(second!.title, { exact: true })).toHaveCount(0)
      })
    })
  }
}

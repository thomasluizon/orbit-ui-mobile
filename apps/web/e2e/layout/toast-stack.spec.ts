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
      test.use({ viewport: { width, height: 915 }, appLocale: locale, reducedMotion: 'reduce' })

      test('separates two and three deletes and centres each undo label', async ({ page, context }) => {
        await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
        await page.goto('/notifications')
        await page.evaluate(() => document.fonts.ready)
        const slot = page.locator('[data-shell-notice-content]')
        const toasts = slot.locator('[data-kind]').filter({ hasText: words.notifications.deleteQueued })
        let singleHeight = 0
        for (const [index, notification] of notifications.items.entries()) {
          await page.getByRole('button', {
            name: words.notifications.deleteNotification.replace('{title}', notification.title), exact: true,
          }).click()
          await expect(toasts).toHaveCount(index + 1)
          if (index === 0) await page.clock.pauseAt(new Date(LAYOUT_FIXED_TIME))
          await expect(async () => {
            const measured = await slot.evaluate(measureToastStack)
            expect(measured).toHaveLength(index + 1)
            expect(measured[0]!.topInset).toBe(0)
            expect(measured.at(-1)!.bottomInset).toBe(0)
            if (index === 0) singleHeight = measured[0]!.height
            for (const [position, toast] of measured.entries()) {
              expect(toast.height).toBe(singleHeight)
              if (position) expect(toast.gap).toBe(12)
              expect(toast.actionOffset).not.toBeNull()
              expect(Math.abs(toast.actionOffset!)).toBeLessThanOrEqual(1)
              expect(Math.abs(toast.closeOffset)).toBeLessThanOrEqual(1)
            }
          }).toPass({ timeout: 3000 })
        }
        for (const notification of notifications.items) {
          await toasts.first().getByRole('button', { name: words.notifications.deleteUndo, exact: true }).click()
          await expect(page.getByText(notification.title, { exact: true })).toBeVisible()
        }
        await expect(toasts).toHaveCount(0)
      })
    })
  }
}

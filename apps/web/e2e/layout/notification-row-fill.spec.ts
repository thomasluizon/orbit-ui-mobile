import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import { measureNotificationFill, measureOwnFill } from './notification-fill-geometry'

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 412, 1352]) {
    test.describe(`Notification row feedback at ${width}px in ${mode}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: 'pt-BR', colorScheme: mode, layoutProfile: { themePreference: mode } })
      test('fills read and unread rows from the body and keeps them at rest under delete', async ({ page, context }) => {
        const notifications = notificationsResponseSchema.parse({
          items: [false, true].map((isRead) => createMockNotification({ id: `fill-${isRead}`, isRead })),
          unreadCount: 1,
        })
        await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
        await page.goto('/notifications')
        const rows = page.locator('li[data-read]')
        await expect(rows).toHaveCount(2)
        for (const row of await rows.all()) {
          const controls = await row.getByRole('button').all()
          expect(controls).toHaveLength(2)
          const body = controls[0]!
          const remove = controls[1]!
          await body.hover()
          await expect.poll(async () => {
            const measured = await row.evaluate(measureNotificationFill)
            expect(measured.bodyPaints).toEqual([])
            return measured.fills
          }).toEqual([(await row.evaluate(measureNotificationFill)).row])
          await page.mouse.down()
          expect((await row.evaluate(measureNotificationFill)).fills).toEqual([(await row.evaluate(measureNotificationFill)).row])
          await page.mouse.move(0, 0)
          expect((await row.evaluate(measureNotificationFill)).fills).toEqual([(await row.evaluate(measureNotificationFill)).row])
          await page.mouse.up()
          await remove.hover()
          const deleteOnly = async () => JSON.stringify((await row.evaluate(measureNotificationFill)).fills) === JSON.stringify([await remove.evaluate(measureOwnFill)])
          await expect.poll(deleteOnly).toBe(true)
          await page.mouse.down()
          await expect.poll(deleteOnly).toBe(true)
          await page.mouse.move(0, 0)
          await page.mouse.up()
          await remove.hover()
          await body.hover()
          await expect.poll(async () => (await row.evaluate(measureNotificationFill)).fills).toEqual([(await row.evaluate(measureNotificationFill)).row])
          await page.mouse.move(0, 0)
        }
      })
    })
  }
}

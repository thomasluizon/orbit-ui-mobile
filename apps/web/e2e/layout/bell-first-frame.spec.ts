import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const notifications = notificationsResponseSchema.parse({
  items: Array.from({ length: 15 }, (_, index) => createMockNotification({ id: `first-frame-${index}`, isRead: false })),
  unreadCount: 15,
})

test.describe('header bell first frame at 600px', () => {
  test.use({ appLocale: 'pt-BR', viewport: { width: 600, height: 915 } })

  for (const [path, controlName] of [['/', ptBR.habits.search.title], ['/calendar', ptBR.calendar.options]] as const) {
    test(`keeps ${path === '/' ? 'Hoje search' : 'Calendário options'} in place when delayed notifications arrive`, async ({ page, context }) => {
      await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications, delayMs: 750 }])
      let releaseNotifications!: () => void
      const notificationGate = new Promise<void>((resolve) => { releaseNotifications = resolve })
      await context.route(`${LAYOUT_ORIGIN}${API.notifications.list}`, async (route) => {
        await notificationGate
        await route.continue()
      })
      try {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        const control = page.getByRole('button', { name: controlName, exact: true }).filter({ visible: true })
        await expect(control).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const firstLeft = await control.evaluate((element) => element.getBoundingClientRect().left)
        releaseNotifications()
        const bell = page.getByRole('button', { name: 'Avisos, 15 sem ler', exact: true }).filter({ visible: true })
        await expect(bell.locator('[data-notification-count]')).toHaveText('9+')
        const loadedLeft = await control.evaluate((element) => element.getBoundingClientRect().left)
        expect(loadedLeft).toBe(firstLeft)
      } finally { releaseNotifications() }
    })
  }
})

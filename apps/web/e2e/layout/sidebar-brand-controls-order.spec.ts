import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'
import { setLayoutFixtureSession } from './profile-session'
import { expectInteractionFill } from './label-interaction-fill'

const notifications = notificationsResponseSchema.parse({
  items: [createMockNotification({ isRead: false })],
  unreadCount: 12,
})

for (const width of [1024, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      test.describe(`sidebar brand controls order at ${width}px in ${locale} and ${mode}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { themePreference: mode } })

        test('puts the bell on the lockup row and the theme action before the toggle, expanded and collapsed', async ({ page, context }) => {
          const words = locale === 'en' ? en : ptBR
          await setLayoutFixtureSession(context, [{ path: API.notifications.list, body: notifications }])
          await page.goto('/')
          const sidebar = page.locator('[data-shell-sidebar]')
          const toggle = sidebar.locator('[data-shell-sidebar-toggle]')
          const bell = sidebar.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await expect(bell.locator('[data-notification-count]')).toHaveText('9+')

          for (const collapsed of [false, true, false]) {
            await expect(toggle).toHaveAttribute('aria-expanded', String(!collapsed))
            await expect(async () => {
              const geometry = await sidebar.evaluate(element => {
                const bounds = (node: Element) => {
                  const rect = node.getBoundingClientRect()
                  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
                }
                return {
                  sidebar: bounds(element),
                  bell: bounds(element.querySelector('button:has(.tabler-icon-bell)')!),
                  toggle: bounds(element.querySelector('[data-shell-sidebar-toggle]')!),
                  lockup: bounds(element.querySelector('[data-asset="orbit-lockup"]')!),
                  theme: bounds(element.querySelector('[data-theme-toggle]')!),
                  overflow: element.scrollWidth > element.clientWidth,
                }
              })
              expect(geometry.overflow).toBe(false)
              expect(geometry.bell.left - geometry.sidebar.left).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
              expect(geometry.sidebar.right - geometry.bell.right).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
              expect(geometry.bell.width).toBe(44)
              expect(geometry.bell.height).toBe(44)
              if (collapsed) {
                expect(geometry.bell.top - geometry.toggle.bottom).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
                expect(geometry.bell.left).toBe(geometry.toggle.left)
              } else {
                expect(geometry.theme.left - geometry.sidebar.left).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
                expect(Math.abs(geometry.theme.left - geometry.lockup.left)).toBeLessThanOrEqual(1)
                expect(geometry.toggle.top).toBe(geometry.theme.top)
                expect(geometry.toggle.left - geometry.theme.right).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
                expect(geometry.toggle.right).toBe(geometry.bell.right)
                expect(geometry.bell.left - geometry.lockup.right).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
              }
            }).toPass()
            await expectInteractionFill(bell)
            await toggle.click()
          }
          await bell.click()
          await expect(page).toHaveURL(/\/notifications$/)
        })
      })
    }
  }
}

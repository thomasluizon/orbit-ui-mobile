import { expect, type Locator, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'
import { measureScrollbarGutter } from './scrollbar-geometry'

async function waitForRoot(page: Page, root: string, words: typeof en) {
  if (root === '/calendar') {
    await expect(page.getByTestId('calendar-day-select-2026-09-04')).toBeVisible()
    await expect(page.getByTestId('calendar-grid').getByRole('progressbar')).toHaveCount(0)
  } else if (root === '/progress') {
    await expect(page.getByText(words.progressScreen.goals.empty, { exact: true })).toBeVisible()
  } else if (root === '/profile') {
    await expect(page.getByTestId('profile-settings-groups')).toBeVisible()
  }
}

async function measureCount(bell: Locator) {
  return bell.evaluate((element) => {
    const box = (target: Element) => {
      const bounds = target.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height, centerY: bounds.top + bounds.height / 2 }
    }
    const count = element.querySelector('[data-notification-count]')!
    return { control: box(element), icon: box(element.querySelector('svg')!), count: box(count),
      radius: getComputedStyle(count).borderRadius, position: getComputedStyle(count).position,
      hidden: count.getAttribute('aria-hidden'), text: count.textContent.trim() }
  })
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [320, 600, 840, 1280]) {
    for (const mode of ['dark', 'light'] as const) {
      for (const unreadCount of [5, 12]) {
        test.describe(`root bell count in ${locale} at ${width} in ${mode} with ${unreadCount} unread`, () => {
          test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { themePreference: mode } })
          const words = locale === 'pt-BR' ? ptBR : en

          test('contains the root count and retains the sidebar corner count', async ({ page, context }) => {
            const notifications = notificationsResponseSchema.parse({
              items: Array.from({ length: unreadCount }, (_, index) => createMockNotification({ id: `bell-count-${index}`, isRead: false })),
              unreadCount,
            })
            await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.notifications.list,
              (route) => route.fulfill({ json: notifications }))
            await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.habits.calendarMonth,
              (route) => route.fulfill({ json: calendarMonthResponseSchema.parse({ habits: [], logs: {} }) }))
            await context.route((url) => url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list,
              (route) => route.fulfill({ json: emptyGoalsPageFixture }))
            let todayRight: number | undefined
            for (const root of ['/', '/calendar', '/progress', '/profile']) {
              await page.goto(root)
              await waitForRoot(page, root, words)
              const bell = page.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) }).filter({ visible: true })
              await expect(bell).toHaveCount(1)
              await expect(bell.locator('[data-notification-count]')).toHaveText(unreadCount > 9 ? '9+' : String(unreadCount))
              await page.evaluate(() => document.fonts.ready)
              if (width >= 1024) {
                await expect(page.locator('[data-shell-sidebar]')).toContainText(unreadCount > 9 ? '9+' : String(unreadCount))
                const geometry = await measureCount(bell)
                expect(geometry.position).toBe('absolute')
                expect(geometry.count.top).toBe(geometry.control.top)
                expect(geometry.count.right).toBe(geometry.control.right)
                expect(geometry.radius).toBe('8px')
                continue
              }
              const row = root === '/' ? page.locator('[data-today-header-actions]')
                : root === '/calendar' ? page.getByTestId('calendar-shell-header') : page.locator('[data-root-notification-header]')
              await expect(row).toContainText(unreadCount > 9 ? '9+' : String(unreadCount))
              const gutter = await bell.locator('xpath=ancestor::*[@data-shell-column]').locator('[data-shell-scroller]').evaluate(measureScrollbarGutter)
              await expect(async () => {
                const geometry = await measureCount(bell)
                const rowBounds = await row.boundingBox()
                const columnBounds = await bell.locator('xpath=ancestor::*[@data-shell-column]').boundingBox()
                expect(Math.abs(geometry.count.centerY - geometry.icon.centerY)).toBeLessThanOrEqual(1)
                expect(geometry.count.top - rowBounds!.y).toBeGreaterThanOrEqual(4)
                expect(geometry.count.left - geometry.icon.right).toBe(4)
                expect(geometry.control.width).toBeGreaterThanOrEqual(48)
                expect(geometry.control.height).toBeGreaterThanOrEqual(48)
                expect(columnBounds!.x + columnBounds!.width - geometry.control.right - gutter).toBe(16)
                todayRight ??= geometry.control.right
                expect(Math.abs(geometry.control.right - todayRight)).toBeLessThanOrEqual(0.5)
                expect(geometry.radius).toBe('8px')
                expect(geometry.hidden).toBe('true')
                for (const content of [geometry.icon, geometry.count]) {
                  expect(content.left).toBeGreaterThanOrEqual(geometry.control.left)
                  expect(content.right).toBeLessThanOrEqual(geometry.control.right)
                  expect(content.top).toBeGreaterThanOrEqual(geometry.control.top)
                  expect(content.bottom).toBeLessThanOrEqual(geometry.control.bottom)
                }
              }).toPass({ timeout: 5000 })
            }
          })
        })
      }
    }
  }
}

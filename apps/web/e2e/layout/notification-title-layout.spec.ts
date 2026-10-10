import { expect } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { LAYOUT_ORIGIN } from '../support/env'
import { measureTitleWords } from './title-word-geometry'
import { test } from './upgrade-fixtures'

const titles = ['W'.repeat(60), 'Extraordinarily comprehensive internationalization responsibilities']
const notifications = notificationsResponseSchema.parse({
  items: titles.map((title, index) => createMockNotification({
    id: `word-title-${index}`, title, habitId: 'word-title-habit', url: '/habits/word-title-habit',
    isRead: index === 1,
  })),
  unreadCount: 1,
})

for (const width of [320, 412]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`Notification and missing-page words at ${width}px in ${locale}`, () => {
      test.use({ viewport: { width, height: 915 }, appLocale: locale })

      test('keeps title words whole and preserves the full notification destination', async ({ page, context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.notifications.list}`, (route) => route.fulfill({ json: notifications }))
        await page.goto('/notifications')
        const rows = page.locator('[data-notification-title]')
        await expect(rows).toHaveCount(2)
        await page.evaluate(() => document.fonts.ready)
        for (const [index, title] of titles.entries()) {
          const rowTitle = rows.nth(index)
          const geometry = await rowTitle.evaluate(measureTitleWords)
          expect(geometry.splitWords).toEqual([])
          expect(geometry.visibleLines).toBeGreaterThan(0)
          expect(geometry.visibleLines).toBeLessThanOrEqual(index === 0 ? 1 : 2)
          expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight * (index === 0 ? 1 : 2) + 1)
          expect(geometry.overflow).toBe('hidden')
          expect(index === 0 ? geometry.textOverflow : geometry.lineClamp).toBe(index === 0 ? 'ellipsis' : '2')
          await expect(rowTitle).toHaveText(title)
          const action = rowTitle.locator('xpath=ancestor::button')
          await expect(action).toHaveAccessibleName(new RegExp(title))
          await action.click()
          const detail = page.getByRole('dialog', { name: title, exact: true })
          await expect(detail).toBeVisible()
          const detailHeading = detail.getByRole('heading', { name: title, exact: true })
          await expect(detailHeading).toBeVisible()
          await detailHeading.getByRole('button', { name: title, exact: true }).click()
          await expect(detail.locator('.orbit-sheet-full-title')).toBeVisible()
          await expect(detail.locator('.orbit-sheet-full-title')).toHaveText(title)
          await page.keyboard.press('Escape')
          await expect(detail).toHaveCount(0)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        await page.goto('/missing-word-layout-page')
        const messages = locale === 'en' ? en : ptBR
        const heading = page.getByRole('heading', { name: messages.notFoundPage.title, exact: true })
        const action = page.getByRole('link', { name: messages.notFoundPage.action, exact: true })
        await expect(heading).toBeVisible()
        await expect(action).toHaveAttribute('href', '/')
        await page.evaluate(() => document.fonts.ready)
        for (const element of [heading, action]) {
          const geometry = await element.evaluate(measureTitleWords)
          expect(geometry.splitWords).toEqual([])
          expect(geometry.visibleLines).toBe(1)
          expect(geometry.overflowWrap).toBe('normal')
        }
        expect(await page.locator('.error-surface-body').evaluate((element) => getComputedStyle(element).overflowWrap)).toBe('anywhere')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      })
    })
  }
}

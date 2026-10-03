import { expect, type Locator } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

async function measureBell(bell: Locator) {
  return bell.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const row = element.parentElement!.getBoundingClientRect()
    const column = element.closest('[data-shell-column]')!.getBoundingClientRect()
    return {
      right: bounds.right,
      centerY: bounds.top + bounds.height / 2,
      width: bounds.width,
      height: bounds.height,
      rowHeight: row.height,
      rowCenterY: row.top + row.height / 2,
      trailingInset: column.right - bounds.right,
    }
  })
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const width of [320, 412, 840]) {
    test.describe(`root bell position in ${locale} at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      const words = locale === 'pt-BR' ? ptBR : en

      test('aligns every root to Hoje and opens Avisos', async ({ page }) => {
        let today: Awaited<ReturnType<typeof measureBell>> | undefined
        for (const root of ['/', '/calendar', '/progress', '/profile']) {
          await page.goto(root)
          const row = root === '/' ? page.locator('[data-today-header-actions]')
            : root === '/calendar' ? page.getByTestId('calendar-shell-header')
              : page.locator('[data-root-notification-header]')
          const bell = row.getByRole('button', { name: new RegExp(`^${words.notifications.bell}`) })
          await expect(bell).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          await expect(async () => {
            const geometry = await measureBell(bell)
            today ??= geometry
            expect(Math.abs(geometry.right - today.right), `${root} trailing edge`).toBeLessThanOrEqual(1)
            expect(Math.abs(geometry.centerY - today.centerY), `${root} vertical centre`).toBeLessThanOrEqual(1)
            expect(geometry.trailingInset).toBe(16)
            expect(geometry.width).toBeGreaterThanOrEqual(48)
            expect(geometry.height).toBeGreaterThanOrEqual(48)
            expect(geometry.rowHeight).toBe(48)
            expect(geometry.centerY).toBe(geometry.rowCenterY)
          }).toPass({ timeout: 5000 })
          if (root === '/progress' || root === '/profile') {
            await expect(row.getByRole('button')).toHaveCount(1)
            await expect(row.getByRole('heading')).toHaveCount(0)
            expect(await row.evaluate((element) => Boolean(element.closest('[data-shell-scroller]')))).toBe(true)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          await bell.click()
          await expect(page).toHaveURL(/\/notifications$/)
          await expect(page.getByRole('heading', { name: words.notifications.title, exact: true })).toBeVisible()
        }
      })
    })
  }
}

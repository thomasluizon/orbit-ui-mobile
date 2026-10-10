import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  const words = locale === 'en' ? en : ptBR
  for (const width of [320, 412, 1352]) {
    for (const destination of ['today', 'calendar'] as const) {
      test.describe(`${destination} first paint at ${width}px in ${locale}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 } })

        test('keeps the selector in place when the header becomes pinned', async ({ page }) => {
          let releaseScripts = () => {}
          const scriptsReleased = new Promise<void>((resolve) => { releaseScripts = resolve })
          await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
            await scriptsReleased
            await route.continue()
          })
          const headerSelector = destination === 'calendar'
            ? '[data-testid="calendar-shell-header"]' : '[data-today-header-actions]'
          const selector = destination === 'calendar'
            ? page.getByRole('radiogroup', { name: words.calendar.view.switchLabel })
            : page.locator('[data-today-date-row]')
          try {
            await page.goto(destination === 'calendar' ? '/calendar' : '/', { waitUntil: 'commit' })
            await expect(selector).toBeVisible()
            await expect(selector).toHaveCSS('display', destination === 'calendar' ? 'grid' : 'flex')
            await page.evaluate(() => document.fonts.ready)
            await page.locator(headerSelector).evaluate((header) => {
              header.setAttribute('data-first-paint-header', '')
              for (const control of header.querySelectorAll('button')) control.setAttribute('data-first-paint-control', '')
            })
            const firstTop = await selector.evaluate((element) => element.getBoundingClientRect().top)
            const firstHeader = await page.locator('[data-shell-column]').evaluate((column, headerSelector) => {
              const header = column.querySelector(headerSelector)
              return {
                height: header?.getBoundingClientRect().height ?? 0,
                controls: header?.querySelectorAll('button').length ?? 0,
              }
            }, headerSelector)
            releaseScripts()
            await expect(page.locator(`[data-shell-header] ${headerSelector}`)).toBeVisible()
            await expect(page.locator(headerSelector)).toHaveAttribute('data-first-paint-header', '')
            await expect(page.locator(`${headerSelector} button:not([data-first-paint-control])`)).toHaveCount(0)
            await page.waitForLoadState('load')
            await page.evaluate(() => document.fonts.ready)
            const hydratedTop = await selector.evaluate((element) => element.getBoundingClientRect().top)
            expect(hydratedTop, 'selector top remains at its first paint position').toBeCloseTo(firstTop, 1)
            expect(firstHeader.height, 'header row exists in server HTML').toBeGreaterThanOrEqual(48)
            expect(firstHeader.controls, 'options and bell exist before hydration').toBeGreaterThanOrEqual(2)
            await expect(page.locator(headerSelector)).toHaveCount(1)
          } finally {
            releaseScripts()
          }
        })
      })
    }
  }
}

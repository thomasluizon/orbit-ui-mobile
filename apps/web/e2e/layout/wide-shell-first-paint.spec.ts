import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './upgrade-fixtures'

for (const locale of ['en', 'pt-BR'] as const) {
  const words = locale === 'en' ? en : ptBR
  for (const width of [412, 1023, 1024, 1100, 1352]) {
    for (const destination of ['today', 'calendar', 'progress', 'profile'] as const) {
      test.describe(`${destination} shell first paint at ${width}px in ${locale}`, () => {
        test.use({ appLocale: locale, viewport: { width, height: 915 } })

        test('keeps responsive chrome and sidebar positions through hydration', async ({ page }) => {
          let releaseScripts = () => {}
          const scriptsReleased = new Promise<void>((resolve) => { releaseScripts = resolve })
          await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
            await scriptsReleased
            await route.continue()
          })
          const sidebar = page.locator('[data-shell-sidebar]')
          const composer = page.locator('[data-shell-pinned-slot] [data-composer-root]')
          const header = destination === 'today' ? '[data-today-header-actions]'
            : destination === 'calendar' ? '[data-testid="calendar-shell-header"]' : '[data-root-notification-header]'
          const headerBell = page.locator(header).getByRole('button', { name: words.notifications.bell, exact: true })
          const sidebarBell = sidebar.getByRole('button', { name: words.notifications.bell, exact: true })
          const measure = () => page.evaluate(() => {
            const tops = (selector: string) => Array.from(document.querySelectorAll(selector), (element) => element.getBoundingClientRect().top)
            return {
              destinations: tops('[data-shell-sidebar] nav > :not([data-shell-astra-row])'),
              astra: tops('[data-shell-astra-row]'),
              account: tops('[data-shell-account]'),
              tabs: tops('[data-shell-tab-bar]'),
              composer: tops('[data-shell-pinned-slot] [data-composer-root]'),
            }
          })
          const assertChrome = async () => {
            await expect(sidebar.locator('[data-shell-astra-row]')).toHaveCount(1)
            if (width >= 1024) {
              await expect(sidebar).toBeVisible()
              await expect(sidebar.locator('[data-shell-astra-row]')).toBeVisible()
              await expect(sidebarBell).toBeVisible()
              await expect(headerBell).toBeHidden()
              await expect(composer).toBeHidden()
              await expect(page.locator('[data-shell-bottom]')).toHaveCSS('height', '0px')
            } else {
              await expect(sidebar).toBeHidden()
              await expect(sidebarBell).toBeHidden()
              await expect(headerBell).toBeVisible()
              await expect(page.locator('[data-shell-tab-bar]')).toBeVisible()
              if (destination === 'today') await expect(composer).toBeVisible()
              else await expect(composer).toHaveCount(0)
            }
          }
          try {
            await page.goto(destination === 'today' ? '/' : `/${destination}`, { waitUntil: 'commit' })
            await expect(page.locator('[data-shell-column]')).toBeVisible()
            await page.evaluate(() => document.fonts.ready)
            await assertChrome()
            const first = await measure()
            expect(first.destinations).toHaveLength(4)
            expect(first.astra).toHaveLength(1)
            expect(first.account).toHaveLength(1)
            releaseScripts()
            await page.waitForLoadState('load')
            if (destination === 'today' || destination === 'calendar') {
              await expect(page.locator(`[data-shell-header] ${header}`)).toBeVisible()
            }
            await page.evaluate(() => document.fonts.ready)
            await assertChrome()
            await expect.poll(measure).toEqual(first)
          } finally {
            releaseScripts()
          }
        })
      })
    }
  }
}

import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

const name = 'W'.repeat(60)
const email = `${'W'.repeat(48)}@example.com`
const accountRoute = PROFILE_SUBMENUS.find((submenu) => submenu.id === 'account')!.route

for (const width of [320, 360, 384, 412, 1024, 1100, 1352, 1440]) {
  for (const locale of ['pt-BR', 'en'] as const) {
    test.describe(`sidebar account text at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 900 }, layoutProfile: { name, email } })

      test('keeps one growing account link and reaches the profile account row', async ({ page }) => {
        const words = locale === 'pt-BR' ? ptBR : en
        await page.goto(`${LAYOUT_ORIGIN}/profile`)
        const profileAccount = page.locator(`a[href="${accountRoute}"]`)
        await expect(profileAccount.getByText(name, { exact: true })).toBeVisible()
        await expect(profileAccount.getByText(email, { exact: true })).toBeVisible()
        const sidebar = page.locator('[data-shell-sidebar]')
        if (width < 1024) {
          await expect(sidebar).toBeHidden()
          await expect(page.locator('[data-shell-tab-bar]')).toBeVisible()
          return
        }

        await expect(sidebar).toBeVisible()
        for (const label of [words.nav.today, words.nav.calendar, words.nav.progress, words.nav.profile]) {
          await markRequiredLabels(sidebar.getByRole('button', { name: label, exact: true }))
        }
        const account = sidebar.locator('[data-shell-account]:not([data-loading])')
        await expect(account).toHaveCount(1)
        await expect(account).toHaveAttribute('href', '/profile')
        for (const value of [name, email]) {
          const field = account.getByText(value, { exact: true })
          await expect(field).toBeVisible()
          const geometry = await field.evaluate((element) => {
            const style = getComputedStyle(element)
            return { lines: element.clientHeight / Number.parseFloat(style.lineHeight),
              clamp: style.webkitLineClamp, clipped: element.scrollWidth > element.clientWidth,
              width: element.getBoundingClientRect().width, availableWidth: element.parentElement!.clientWidth }
          })
          expect(geometry.lines).toBeCloseTo(1, 0)
          expect(geometry.clamp).toBe('none')
          expect(geometry.clipped).toBe(true)
          expect(geometry.width).toBeCloseTo(geometry.availableWidth, 0)
        }
        await markUserText(page, [name, email])
        await expectLabelsFit(page, sidebar, [name, email])
        await sidebar.getByRole('button', { name: words.nav.today, exact: true }).click()
        await expect(page).toHaveURL(`${LAYOUT_ORIGIN}/`)
        await account.click()
        await expect(page).toHaveURL(`${LAYOUT_ORIGIN}/profile`)
        await expect(profileAccount.getByText(name, { exact: true })).toBeVisible()
        await expect(profileAccount.getByText(email, { exact: true })).toBeVisible()
      })

      if (width >= 1024) {
        test.describe('account interaction fill', () => {
          test.use({ layoutProfile: { name: 'Ada', email: 'ada@example.com' } })

          test('paints the complete padded account target on hover and press', async ({ page }) => {
            await page.goto(`${LAYOUT_ORIGIN}/profile`)
            const account = page.locator('[data-shell-sidebar] [data-shell-account]:not([data-loading])')
            await expect(account.getByText('Ada', { exact: true })).toBeVisible()
            await expect(account.getByText('ada@example.com', { exact: true })).toBeVisible()
            await expectInteractionFill(account)
          })
        })
      }
    })
  }
}

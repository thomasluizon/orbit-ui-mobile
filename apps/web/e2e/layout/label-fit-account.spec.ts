import { expect } from '@playwright/test'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markUserText } from './label-fit-contract'
import { test } from './upgrade-fixtures'

const email = `${'longaddress'.repeat(12)}@example.com`
const accountRoute = PROFILE_SUBMENUS.find((submenu) => submenu.id === 'account')!.route

for (const width of [320, 1024, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`intact account email at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 900 }, layoutProfile: { name: 'Ada', email } })

      test('ellipsizes the token and retains its full name through the account destination', async ({ page }) => {
        await page.goto(`${LAYOUT_ORIGIN}/profile`)
        const account = page.locator(`a[href="${accountRoute}"]`)
        await expect(account).toHaveAccessibleName(new RegExp(email.replaceAll('.', '\\.')))
        await expect(account.getByText(email, { exact: true })).toBeVisible()
        const fields = [account.getByText(email, { exact: true })]
        if (width >= 1024) {
          const sidebarAccount = page.locator('[data-shell-sidebar] [data-shell-account]:not([data-loading])')
          await expect(sidebarAccount).toHaveAccessibleName(`Ada, ${email}`)
          fields.push(sidebarAccount.locator('[data-shell-account-email]'))
          await sidebarAccount.click()
          await expect(page).toHaveURL(`${LAYOUT_ORIGIN}/profile`)
        }
        for (const field of fields) {
          const geometry = await field.evaluate((element) => {
            const style = getComputedStyle(element)
            const range = document.createRange()
            range.selectNodeContents(element)
            return { lines: new Set([...range.getClientRects()].map((rect) => rect.top)).size,
              ellipsis: style.textOverflow, clipped: element.scrollWidth > element.clientWidth,
              height: element.clientHeight, lineHeight: Number.parseFloat(style.lineHeight) }
          })
          expect(geometry.lines).toBe(1)
          expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight + 1)
          expect(geometry.ellipsis).toBe('ellipsis')
          expect(geometry.clipped).toBe(true)
        }
        await markUserText(page, [email])
        await expectLabelsFit(page, account, [email])
        await account.click()
        await expect(page).toHaveURL(`${LAYOUT_ORIGIN}${accountRoute}`)
        const editor = page.getByRole('button').filter({ has: page.getByText(email, { exact: true }) })
        await expect(editor).toHaveAccessibleName(new RegExp(email.replaceAll('.', '\\.')))
        await expect(editor.getByText(email, { exact: true })).toBeVisible()
      })
    })
  }
}

import { expect, test } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'

for (const [locale, messages] of [['en', en], ['pt-BR', ptBr]] as const) {
  for (const { width, height } of [{ width: 360, height: 780 }, { width: 412, height: 915 }]) {
    test.describe(`${locale} sign-in at ${width} by ${height}`, () => {
      test.use({ viewport: { width, height }, storageState: { cookies: [], origins: [] } })

      for (const step of ['email', 'code'] as const) {
        test(`centres the ${step} column between the safe areas`, async ({ page, context }) => {
          await context.addCookies([{ name: 'i18n_locale', value: locale, url: LAYOUT_ORIGIN }])
          const path = step === 'code' ? '/login?email=name%40example.com&code=123456' : '/login'
          await page.goto(path)
          await expect(page.getByRole('heading', {
            name: step === 'code' ? messages.auth.enterCode : messages.auth.emailTitle,
          })).toBeVisible()
          await page.evaluate(() => document.fonts.ready)

          const gaps = await page.locator('main > div').first().evaluate((column) => {
            const main = column.closest('main')
            if (!main) throw new Error('Sign-in column has no layout container')
            const mainBounds = main.getBoundingClientRect()
            const columnBounds = column.getBoundingClientRect()
            const style = getComputedStyle(main)
            return {
              top: columnBounds.top - mainBounds.top - Number.parseFloat(style.paddingTop),
              bottom: mainBounds.bottom - Number.parseFloat(style.paddingBottom) - columnBounds.bottom,
            }
          })
          expect(gaps.top, `${locale} ${step} column starts within the safe area`).toBeGreaterThanOrEqual(0)
          expect(Math.abs(gaps.top - gaps.bottom), `${locale} ${step} column is vertically centred`)
            .toBeLessThanOrEqual(1)
        })
      }
    })
  }
}
